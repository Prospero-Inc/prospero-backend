import { Injectable } from '@nestjs/common';
import { MovementSource, Transaction } from '@prisma/client';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';

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
}
