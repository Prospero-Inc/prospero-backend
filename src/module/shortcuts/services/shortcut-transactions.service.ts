import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BudgetCategory,
  MovementSource,
  Transaction,
  TransactionReviewStatus,
} from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';
import { WalletCardsService } from 'src/module/wallet-cards/services/wallet-cards.service';
import { MerchantRulesService } from 'src/module/merchant-rules/services/merchant-rules.service';
import { normalizeMerchantKey } from 'src/module/merchant-rules/merchant-key.util';
import { toCents } from 'src/module/money/to-cents.util';
import { CreateShortcutTransactionDto } from '../dto/create-shortcut-transaction.dto';
import { ShortcutPrincipal } from '../guards/shortcut-principal';
import { ShortcutTokensService } from './shortcut-tokens.service';
import { parseShortcutAmount } from '../utils/parse-amount.util';
import { resolveOccurredAt } from '../utils/wall-clock.util';
import {
  DOUBLE_FIRE_WINDOW_MS,
  SHORTCUT_LOCALE,
  SUGGESTION_SAMPLE_SIZE,
} from '../shortcuts.constants';

export type ShortcutTransactionStatus =
  | 'created'
  | 'pending_review'
  | 'duplicate';

/** `POST /shortcuts/transactions` response. `message` is what the
 * automation shows the user; the rest is for clients and tests. */
export interface ShortcutTransactionResult {
  message: string;
  status: ShortcutTransactionStatus;
  /** The created row, or the existing one it duplicated. */
  transactionId: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Display order, also the tie-break for the suggestion heuristic. */
const CATEGORY_ORDER: BudgetCategory[] = [
  BudgetCategory.Necesidad,
  BudgetCategory.Deseo,
  BudgetCategory.Ahorro,
];

const REVIEWABLE: TransactionReviewStatus[] = [
  TransactionReviewStatus.Detected,
  TransactionReviewStatus.PendingReview,
];

function startOfUTCDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfUTCDay(date: Date): Date {
  return new Date(startOfUTCDay(date).getTime() + DAY_MS - 1);
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(toCents(a) - toCents(b)) <= 1;
}

/** Same merchant for double-fire detection: same normalized key, or (when
 * the key is empty, e.g. "#123") the same trimmed, case-folded text. */
function sameMerchant(a: string | null, b: string): boolean {
  if (!a) return false;
  const keyA = normalizeMerchantKey(a);
  const keyB = normalizeMerchantKey(b);
  if (keyA && keyB) return keyA === keyB;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Most frequent category; ties go to CATEGORY_ORDER. */
function mode(counts: Map<BudgetCategory, number>): BudgetCategory | null {
  let best: BudgetCategory | null = null;
  for (const category of CATEGORY_ORDER) {
    const count = counts.get(category) ?? 0;
    if (count > 0 && (best === null || count > (counts.get(best) ?? 0))) {
      best = category;
    }
  }
  return best;
}

type Resolution =
  | { kind: 'categorized'; category: BudgetCategory }
  | { kind: 'review' };

/**
 * Records an Apple Pay purchase reported by the iPhone Shortcuts
 * "Transaction" automation. Flow:
 *
 * 1. Amount (lenient, see parseShortcutAmount) and date (El Salvador wall
 *    clock as UTC literal); 400 if unreadable.
 * 2. The card is looked up by name, auto-registered with no default
 *    category when new.
 * 3. Duplicates, before creating anything ("Ya estaba registrado"):
 *    a) the automation fired twice: a Shortcut row, same amount (±1 cent),
 *       same merchant, created < 2 minutes ago;
 *    b) the user already typed it: a Manual row, same amount, same day;
 *    c) Gmail caught it first: a Gmail row, same amount, ±1 calendar day.
 *       If that row is still in the review queue and this request resolves
 *       a category, the category is applied through
 *       TransactionsService.update (→ Confirmed, learns the MerchantRule
 *       under the same rules as a PATCH).
 * 4. Category: MerchantRule for the merchant, else the card's default.
 *    Either way the row is created Confirmed. If neither applies, it is
 *    created with no category, `PendingReview` (the same review queue Gmail
 *    detections use) and a `suggestedCategory`, see suggestCategory.
 */
@Injectable()
export class ShortcutTransactionsService {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly walletCardsService: WalletCardsService,
    private readonly merchantRulesService: MerchantRulesService,
    private readonly shortcutTokensService: ShortcutTokensService,
    private readonly i18n: I18nService,
  ) {}

  async record(
    principal: ShortcutPrincipal,
    dto: CreateShortcutTransactionDto,
    now: Date = new Date(),
  ): Promise<ShortcutTransactionResult> {
    const { userId } = principal;
    // Every authenticated request counts as a use, even a rejected body.
    await this.shortcutTokensService.touch(principal.tokenId, now);

    const amount = parseShortcutAmount(dto.amount);
    if (amount === null) {
      throw new BadRequestException(this.t('shortcut.invalidAmount'));
    }
    const date = resolveOccurredAt(dto.occurredAt, now);
    if (!date) {
      throw new BadRequestException(this.t('shortcut.invalidDate'));
    }
    const merchant = dto.merchant.trim();

    const card = await this.walletCardsService.findOrCreateByName(
      userId,
      dto.card,
    );

    const ownDuplicate =
      (await this.findDoubleFire(userId, amount, merchant, now)) ??
      (await this.findManualSameDay(userId, amount, date));
    if (ownDuplicate) {
      return this.duplicate(ownDuplicate.id);
    }

    const resolution = await this.resolveCategory(
      userId,
      merchant,
      card.defaultCategory,
    );

    const gmailDuplicate = await this.findGmailNearby(userId, amount, date);
    if (gmailDuplicate) {
      if (
        resolution.kind === 'categorized' &&
        REVIEWABLE.includes(gmailDuplicate.reviewStatus)
      ) {
        await this.transactionsService.update(gmailDuplicate.id, userId, {
          category: resolution.category,
        });
        return this.duplicate(gmailDuplicate.id, resolution.category);
      }
      return this.duplicate(gmailDuplicate.id);
    }

    const base = {
      amount,
      date,
      description: merchant,
      institutionId: card.financialInstitutionId,
      walletCardId: card.id,
    };

    if (resolution.kind === 'categorized') {
      const created = await this.transactionsService.createFromShortcut(
        userId,
        {
          ...base,
          category: resolution.category,
          reviewStatus: TransactionReviewStatus.Confirmed,
        },
      );
      return {
        status: 'created',
        transactionId: created.id,
        message: this.t('shortcut.saved', {
          amount: this.formatAmount(amount),
          merchant,
          category: this.categoryLabel(resolution.category),
        }),
      };
    }

    const created = await this.transactionsService.createFromShortcut(userId, {
      ...base,
      category: null,
      reviewStatus: TransactionReviewStatus.PendingReview,
      suggestedCategory: await this.suggestCategory(userId, merchant),
    });
    return {
      status: 'pending_review',
      transactionId: created.id,
      message: this.t('shortcut.saved', {
        amount: this.formatAmount(amount),
        merchant,
        category: this.t('shortcut.pendingReview'),
      }),
    };
  }

  private async resolveCategory(
    userId: number,
    merchant: string,
    cardDefault: BudgetCategory | null,
  ): Promise<Resolution> {
    const rule = await this.merchantRulesService.find(userId, merchant);
    if (rule) return { kind: 'categorized', category: rule.category };
    if (cardDefault) return { kind: 'categorized', category: cardDefault };
    return { kind: 'review' };
  }

  /**
   * Pre-selection for the review queue when nothing classified the purchase.
   * Transaction has no card FK, so "what this card usually is" can't be
   * asked directly; instead, in order:
   * 1. the most used category among the user's latest
   *    SUGGESTION_SAMPLE_SIZE confirmed, classified rows whose description
   *    normalizes to this merchant's key (a MerchantRule for that key can't
   *    exist here, or step 4 of `record` would have used it);
   * 2. the user's most used confirmed category overall;
   * 3. Necesidad.
   * Ties go to Necesidad > Deseo > Ahorro.
   */
  async suggestCategory(
    userId: number,
    merchant: string,
  ): Promise<BudgetCategory> {
    const key = normalizeMerchantKey(merchant);
    if (key) {
      const rows =
        await this.transactionsService.findRecentClassifiedWithDescription(
          userId,
          SUGGESTION_SAMPLE_SIZE,
        );
      const counts = new Map<BudgetCategory, number>();
      for (const row of rows) {
        if (row.category && normalizeMerchantKey(row.description) === key) {
          counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
        }
      }
      const byMerchant = mode(counts);
      if (byMerchant) return byMerchant;
    }

    const totals =
      await this.transactionsService.countConfirmedByCategory(userId);
    const overall = mode(
      new Map(totals.map(({ category, count }) => [category, count])),
    );
    return overall ?? BudgetCategory.Necesidad;
  }

  private async findDoubleFire(
    userId: number,
    amount: number,
    merchant: string,
    now: Date,
  ): Promise<Transaction | null> {
    const candidates = await this.transactionsService.findDuplicateCandidates(
      userId,
      {
        sources: [MovementSource.Shortcut],
        createdAfter: new Date(now.getTime() - DOUBLE_FIRE_WINDOW_MS),
      },
    );
    return (
      candidates.find(
        (row) =>
          sameAmount(row.amount, amount) &&
          sameMerchant(row.description, merchant),
      ) ?? null
    );
  }

  private async findManualSameDay(
    userId: number,
    amount: number,
    date: Date,
  ): Promise<Transaction | null> {
    const candidates = await this.transactionsService.findDuplicateCandidates(
      userId,
      {
        sources: [MovementSource.Manual],
        dateFrom: startOfUTCDay(date),
        dateTo: endOfUTCDay(date),
      },
    );
    return candidates.find((row) => sameAmount(row.amount, amount)) ?? null;
  }

  /** Prefers a row still in the review queue (so two same-amount purchases
   * confirm two different Gmail rows), then the closest in time. */
  private async findGmailNearby(
    userId: number,
    amount: number,
    date: Date,
  ): Promise<Transaction | null> {
    const day = startOfUTCDay(date).getTime();
    const candidates = await this.transactionsService.findDuplicateCandidates(
      userId,
      {
        sources: [MovementSource.Gmail],
        dateFrom: new Date(day - DAY_MS),
        dateTo: new Date(day + 2 * DAY_MS - 1),
      },
    );
    const matches = candidates.filter((row) => sameAmount(row.amount, amount));
    matches.sort((a, b) => {
      const pendingA = REVIEWABLE.includes(a.reviewStatus) ? 0 : 1;
      const pendingB = REVIEWABLE.includes(b.reviewStatus) ? 0 : 1;
      if (pendingA !== pendingB) return pendingA - pendingB;
      return (
        Math.abs(a.date.getTime() - date.getTime()) -
        Math.abs(b.date.getTime() - date.getTime())
      );
    });
    return matches[0] ?? null;
  }

  private duplicate(
    transactionId: number,
    appliedCategory?: BudgetCategory,
  ): ShortcutTransactionResult {
    return {
      status: 'duplicate',
      transactionId,
      message: appliedCategory
        ? this.t('shortcut.alreadyRegisteredWithCategory', {
            category: this.categoryLabel(appliedCategory),
          })
        : this.t('shortcut.alreadyRegistered'),
    };
  }

  private categoryLabel(category: BudgetCategory): string {
    return this.t(`shortcut.category.${category}`);
  }

  /** "$12.50", "$1,234.56": USD only (multi-currency is out of MVP scope). */
  private formatAmount(amount: number): string {
    return `$${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  private t(key: string, args?: Record<string, string>): string {
    return this.i18n.t(key, { lang: SHORTCUT_LOCALE, args });
  }
}
