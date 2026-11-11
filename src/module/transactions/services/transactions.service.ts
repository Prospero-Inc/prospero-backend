import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  BudgetCategory,
  MovementSource,
  Transaction,
  TransactionReviewStatus,
} from '@prisma/client';
import { MerchantRulesService } from 'src/module/merchant-rules/services/merchant-rules.service';
import { NON_LEARNABLE_PARSER_KEYS } from 'src/module/merchant-rules/merchant-rules.constants';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';
import {
  DuplicateCandidateFilters,
  LatestShortcutTransaction,
  TransactionFilters,
  TransactionsRepository,
} from '../repositories/transactions.repository';

// fixedExpenseId is intentionally absent from CreateTransactionDto (the
// public HTTP contract, guarded by the global whitelist ValidationPipe) so
// no external client can link a transaction to an arbitrary fixed expense.
// Only internal callers (FixedExpensesService.pay) may set it.
export interface CreateTransactionInput extends CreateTransactionDto {
  fixedExpenseId?: number;
}

// Internal-only input for the Gmail sync pipeline (GmailSyncOrchestrator) —
// never routed through the public ValidationPipe, which is exactly why
// `category` is absent here: a Gmail-detected expense always starts
// unassigned ("Por clasificar" in spec terms) until the user reviews it.
export interface CreateGmailTransactionInput {
  amount: number;
  date: Date;
  description?: string;
  // Optional because the "create-anyway" flow (ProcessedEmailsService)
  // reconstructs a transaction from a ProcessedEmail snapshot that never
  // stored which FinancialInstitution it came from — only senderEmail.
  // The normal pipeline (GmailSyncOrchestrator) always has it on hand and
  // keeps passing it.
  institutionId?: number;
  gmailMessageId: string;
}

// Internal-only input for the iPhone Shortcuts endpoint (ShortcutsService).
// `category: null` + `reviewStatus: PendingReview` puts the row in the same
// review queue Gmail detections use; `suggestedCategory` pre-selects one.
export interface CreateShortcutTransactionInput {
  amount: number;
  date: Date;
  description: string;
  category: BudgetCategory | null;
  reviewStatus: TransactionReviewStatus;
  suggestedCategory?: BudgetCategory | null;
  institutionId?: number | null;
  /** Wallet card that paid it, so lists can show "iPhone · BAC Visa". */
  walletCardId?: number | null;
}

// Same widening pattern as CreateTransactionInput: reviewStatus is never on
// the public UpdateTransactionDto (no external client may set it directly),
// only this service may transition it, from `update()` below.
// `rememberMerchant` is a PATCH instruction, never a column.
export interface UpdateTransactionInput
  extends Omit<UpdateTransactionDto, 'rememberMerchant'> {
  reviewStatus?: TransactionReviewStatus;
}

/** `GET /transactions`'s actual response shape: every row plus, when a
 * still-unresolved `PossibleDuplicate` email points at it, who sent it and
 * when it was detected — `null` otherwise (including for every non-Manual
 * row, since the Gmail pipeline never flags its own detections as
 * duplicates of themselves). */
export interface TransactionWithPossibleDuplicate extends Transaction {
  /** Name of the fixed expense this row pays, if any — list label. */
  fixedExpenseName: string | null;
  /** Bank the row was detected from, if any — list label. */
  institutionName: string | null;
  /** Apple Wallet card that paid a Shortcuts row, if any — list label. */
  walletCard: { id: number; name: string } | null;
  possibleGmailDuplicate: {
    id: number;
    senderEmail: string;
    processedAt: Date;
  } | null;
}

const REVIEWABLE_STATUSES: TransactionReviewStatus[] = [
  TransactionReviewStatus.Detected,
  TransactionReviewStatus.PendingReview,
];

/** Mirrors `IncomeReviewStatus`'s "still needs the user's attention" set —
 * used by the review-queue summary count. */
export const PENDING_REVIEW_TRANSACTION_STATUSES: TransactionReviewStatus[] = [
  TransactionReviewStatus.Detected,
  TransactionReviewStatus.PendingReview,
];

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    private readonly transactionsRepository: TransactionsRepository,
    private readonly merchantRulesService: MerchantRulesService,
  ) {}

  create(userId: number, createTransactionDto: CreateTransactionInput) {
    return this.transactionsRepository.create(userId, createTransactionDto);
  }

  /** Called only by GmailSyncOrchestrator — creates a `source: Gmail`,
   * `reviewStatus: PendingReview` transaction with no category yet. */
  createFromGmail(
    userId: number,
    data: CreateGmailTransactionInput,
  ): Promise<Transaction> {
    return this.transactionsRepository.createFromGmail(userId, data);
  }

  /** Called only by ShortcutsService — creates a `source: Shortcut` row. */
  createFromShortcut(
    userId: number,
    data: CreateShortcutTransactionInput,
  ): Promise<Transaction> {
    return this.transactionsRepository.createFromShortcut(userId, data);
  }

  /** Candidate rows for duplicate detection (Shortcuts and Gmail sync);
   * amount matching is left to the caller, in cents. */
  findDuplicateCandidates(
    userId: number,
    filters: DuplicateCandidateFilters,
  ): Promise<Transaction[]> {
    return this.transactionsRepository.findDuplicateCandidates(userId, filters);
  }

  findRecentClassifiedWithDescription(userId: number, take: number) {
    return this.transactionsRepository.findRecentClassifiedWithDescription(
      userId,
      take,
    );
  }

  countConfirmedByCategory(userId: number) {
    return this.transactionsRepository.countConfirmedByCategory(userId);
  }

  /** Last purchase received from iPhone Shortcuts (by `createdAt`), for
   * the "Funcionando" state of the Shortcuts settings screen. */
  findLatestShortcutTransaction(
    userId: number,
  ): Promise<LatestShortcutTransaction | null> {
    return this.transactionsRepository.findLatestBySource(
      userId,
      MovementSource.Shortcut,
    );
  }

  findAllForUser(userId: number, filters: TransactionFilters = {}) {
    return this.transactionsRepository.findManyByUser(userId, filters);
  }

  /** Used by `GET /transactions` only — plain `findAllForUser` plus the
   * `possibleGmailDuplicate` badge computed from `ProcessedEmail`. Kept
   * separate from `findAllForUser` so internal high-frequency callers
   * (`periods`, `fixed-expenses`, the duplicate detector itself) don't pay
   * for an extra query they never use. */
  async findAllForUserWithPossibleDuplicates(
    userId: number,
    filters: TransactionFilters = {},
  ): Promise<TransactionWithPossibleDuplicate[]> {
    const transactions =
      await this.transactionsRepository.findManyByUserWithLabels(
        userId,
        filters,
      );

    const manualIds = transactions
      .filter((transaction) => transaction.source === MovementSource.Manual)
      .map((transaction) => transaction.id);

    const duplicateRows =
      await this.transactionsRepository.findPossibleDuplicatesFor(manualIds);

    const duplicateByTransactionId = new Map<
      number,
      { id: number; senderEmail: string; processedAt: Date }
    >();
    for (const row of duplicateRows) {
      // senderEmail is nullable in the schema, but handleExpense can only
      // reach the PossibleDuplicate branch after already matching a
      // configured sender, so in practice it's always set here. Skip the
      // (unreachable in production) null case rather than lie about the
      // contract's `string` type.
      if (
        row.senderEmail !== null &&
        !duplicateByTransactionId.has(row.relatedTransactionId)
      ) {
        duplicateByTransactionId.set(row.relatedTransactionId, {
          id: row.id,
          senderEmail: row.senderEmail,
          processedAt: row.processedAt,
        });
      }
    }

    return transactions.map(
      ({ fixedExpense, institution, walletCard, ...transaction }) => ({
        ...transaction,
        fixedExpenseName: fixedExpense?.name ?? null,
        institutionName: institution?.name ?? null,
        walletCard: walletCard ?? null,
        possibleGmailDuplicate:
          duplicateByTransactionId.get(transaction.id) ?? null,
      }),
    );
  }

  /** Cheap count for the `GET /review-queue/summary` badge. */
  countPendingReview(userId: number): Promise<number> {
    return this.transactionsRepository.countByReviewStatus(
      userId,
      PENDING_REVIEW_TRANSACTION_STATUSES,
    );
  }

  private async findOwnedOrThrow(id: number, userId: number) {
    const transaction = await this.transactionsRepository.findOneOwned(
      id,
      userId,
    );

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async update(
    id: number,
    userId: number,
    updateTransactionDto: UpdateTransactionDto,
  ) {
    const existing = await this.findOwnedOrThrow(id, userId);

    // rememberMerchant defaults to true ("Recordar para este comercio" is
    // checked by default in the review queue) and is never persisted.
    const { rememberMerchant = true, ...changes } = updateTransactionDto;
    const data: UpdateTransactionInput = { ...changes };

    // Gap closed: a Gmail-detected transaction is created with no category
    // (reviewStatus Detected/PendingReview). The moment the user assigns one
    // via this same PATCH, that's the user's review/confirmation — auto
    // transition to Confirmed so it doesn't stay "pending review" forever.
    if (
      updateTransactionDto.category !== undefined &&
      REVIEWABLE_STATUSES.includes(existing.reviewStatus)
    ) {
      data.reviewStatus = TransactionReviewStatus.Confirmed;
    }

    const updated = await this.transactionsRepository.update(id, data);

    const category = updateTransactionDto.category;
    if (category && rememberMerchant) {
      await this.learnMerchantRule(
        userId,
        existing,
        category,
        updateTransactionDto.description ?? existing.description,
      );
    }

    return updated;
  }

  /**
   * Setting a category on an existing movement (confirming it in the review
   * queue or editing it, any source) teaches "this merchant is X" for the
   * Shortcuts endpoint. Creating a manual expense does NOT (co-founder
   * decision), and Gmail rows from a parser whose description isn't a
   * merchant (Banco Agrícola, see NON_LEARNABLE_PARSER_KEYS) are skipped.
   * Best effort: a failure here never fails the user's PATCH.
   */
  private async learnMerchantRule(
    userId: number,
    existing: Transaction & {
      institution?: { parserKey: string | null } | null;
    },
    category: BudgetCategory,
    description: string | null,
  ): Promise<void> {
    if (!description) return;

    const parserKey = existing.institution?.parserKey;
    if (
      existing.source === MovementSource.Gmail &&
      parserKey &&
      NON_LEARNABLE_PARSER_KEYS.includes(parserKey)
    ) {
      return;
    }

    try {
      await this.merchantRulesService.upsert(userId, description, category);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not learn merchant rule for transaction ${existing.id}: ${message}`,
      );
    }
  }

  async remove(id: number, userId: number) {
    await this.findOwnedOrThrow(id, userId);
    return this.transactionsRepository.delete(id);
  }
}
