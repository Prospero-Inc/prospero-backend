import { Injectable } from '@nestjs/common';
import { MovementSource, Transaction } from '@prisma/client';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';
import { toCents } from 'src/module/money/to-cents.util';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUTCDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfUTCDay(date: Date): Date {
  const start = startOfUTCDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

function isSameUTCDay(a: Date, b: Date): boolean {
  return startOfUTCDay(a).getTime() === startOfUTCDay(b).getTime();
}

/**
 * Guards against double-booking an expense the user already typed in by
 * hand before the Gmail pipeline caught up — an explicit co-founder
 * requirement (he already logs his own recargas manually, and doesn't want
 * the pipeline to duplicate those). A detected transaction is considered a
 * duplicate of an existing one only if it's `source: Manual`, the exact same
 * amount, and lands on the exact same UTC calendar day — nothing fuzzier
 * than that (two genuinely different $1.50 recargas on different days must
 * never be conflated).
 */
@Injectable()
export class DuplicateDetectorService {
  constructor(private readonly transactionsService: TransactionsService) {}

  async findManualDuplicate(
    userId: number,
    amount: number,
    date: Date,
  ): Promise<Transaction | null> {
    // Narrowed to the target day at the query level purely as an
    // optimization — the exact match below is what actually decides, so a
    // broader candidate list (if a caller/mock ever returns one) can never
    // produce a false positive.
    const candidates = await this.transactionsService.findAllForUser(userId, {
      from: startOfUTCDay(date),
      to: endOfUTCDay(date),
    });

    const match = candidates.find(
      (transaction) =>
        transaction.source === MovementSource.Manual &&
        transaction.amount === amount &&
        isSameUTCDay(transaction.date, date),
    );

    return match ?? null;
  }

  /**
   * The other direction of the iPhone Shortcuts dedupe: an Apple Pay
   * purchase the Shortcuts automation already recorded (`source: Shortcut`)
   * and its bank email arriving later. Deliberately looser than
   * `findManualDuplicate` (which stays strict, see the class comment):
   * Shortcuts and the bank email describe the very same card swipe, but the
   * bank may date it a day off and round differently, so ±1 cent and ±1
   * calendar day (both dates are UTC-literal local times).
   */
  async findShortcutDuplicate(
    userId: number,
    amount: number,
    date: Date,
  ): Promise<Transaction | null> {
    const day = startOfUTCDay(date).getTime();
    const candidates = await this.transactionsService.findDuplicateCandidates(
      userId,
      {
        sources: [MovementSource.Shortcut],
        dateFrom: new Date(day - DAY_MS),
        dateTo: new Date(day + 2 * DAY_MS - 1),
      },
    );

    const matches = candidates.filter(
      (transaction) =>
        transaction.source === MovementSource.Shortcut &&
        Math.abs(toCents(transaction.amount) - toCents(amount)) <= 1 &&
        Math.abs(startOfUTCDay(transaction.date).getTime() - day) <= DAY_MS,
    );
    matches.sort(
      (a, b) =>
        Math.abs(a.date.getTime() - date.getTime()) -
        Math.abs(b.date.getTime() - date.getTime()),
    );
    return matches[0] ?? null;
  }
}
