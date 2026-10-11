import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MovementSource,
  Transaction,
  TransactionReviewStatus,
} from '@prisma/client';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';
import {
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

// Same widening pattern as CreateTransactionInput: reviewStatus is never on
// the public UpdateTransactionDto (no external client may set it directly),
// only this service may transition it, from `update()` below.
export interface UpdateTransactionInput extends UpdateTransactionDto {
  reviewStatus?: TransactionReviewStatus;
}

/** `GET /transactions`'s actual response shape: every row plus, when a
 * still-unresolved `PossibleDuplicate` email points at it, who sent it and
 * when it was detected — `null` otherwise (including for every non-Manual
 * row, since the Gmail pipeline never flags its own detections as
 * duplicates of themselves). */
export interface TransactionWithPossibleDuplicate extends Transaction {
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
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
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
    const transactions = await this.transactionsRepository.findManyByUser(
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

    return transactions.map((transaction) => ({
      ...transaction,
      possibleGmailDuplicate:
        duplicateByTransactionId.get(transaction.id) ?? null,
    }));
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

    const data: UpdateTransactionInput = { ...updateTransactionDto };

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

    return this.transactionsRepository.update(id, data);
  }

  async remove(id: number, userId: number) {
    await this.findOwnedOrThrow(id, userId);
    return this.transactionsRepository.delete(id);
  }
}
