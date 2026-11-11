import { Injectable } from '@nestjs/common';
import {
  BudgetCategory,
  MovementSource,
  ProcessedEmailResult,
  Transaction,
  TransactionReviewStatus,
} from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';
import {
  CreateGmailTransactionInput,
  CreateShortcutTransactionInput,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../services/transactions.service';

/** Narrow candidate fetch for duplicate detection: amounts are compared in
 * cents by the caller (reads still use the Float column, see CLAUDE.md). */
export interface DuplicateCandidateFilters {
  sources: MovementSource[];
  dateFrom?: Date;
  dateTo?: Date;
  createdAfter?: Date;
}

/** Card label every transaction response carries (`walletCard`). */
export const WALLET_CARD_LABEL = {
  walletCard: { select: { id: true, name: true } },
} as const;

/** Most recent `source: Shortcut` row, for GET /shortcuts/status. */
export interface LatestShortcutTransaction {
  id: number;
  description: string | null;
  amount: number;
  date: Date;
  createdAt: Date;
}

export interface TransactionFilters {
  from?: Date;
  to?: Date;
  reviewStatus?: TransactionReviewStatus[];
}

/** Raw shape of an unresolved `PossibleDuplicate` `ProcessedEmail` pointing
 * at a given transaction — see `findPossibleDuplicatesFor`. */
export interface PossibleDuplicateRow {
  id: number;
  relatedTransactionId: number;
  senderEmail: string | null;
  processedAt: Date;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, data: CreateTransactionInput) {
    return this.prisma.transaction.create({
      data: {
        ...data,
        userId,
      },
      include: WALLET_CARD_LABEL,
    });
  }

  createFromGmail(userId: number, data: CreateGmailTransactionInput) {
    return this.prisma.transaction.create({
      data: {
        userId,
        amount: data.amount,
        date: data.date,
        description: data.description,
        institutionId: data.institutionId,
        gmailMessageId: data.gmailMessageId,
        source: MovementSource.Gmail,
        reviewStatus: TransactionReviewStatus.PendingReview,
      },
    });
  }

  createFromShortcut(userId: number, data: CreateShortcutTransactionInput) {
    return this.prisma.transaction.create({
      data: {
        userId,
        amount: data.amount,
        date: data.date,
        description: data.description,
        category: data.category,
        suggestedCategory: data.suggestedCategory,
        reviewStatus: data.reviewStatus,
        institutionId: data.institutionId,
        walletCardId: data.walletCardId,
        source: MovementSource.Shortcut,
      },
    });
  }

  findDuplicateCandidates(
    userId: number,
    filters: DuplicateCandidateFilters,
  ): Promise<Transaction[]> {
    const { sources, dateFrom, dateTo, createdAfter } = filters;
    return this.prisma.transaction.findMany({
      where: {
        userId,
        source: { in: sources },
        ...((dateFrom || dateTo) && {
          date: {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
          },
        }),
        ...(createdAfter && { createdAt: { gte: createdAfter } }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Latest confirmed, classified rows with a description — input for the
   * Shortcuts `suggestedCategory` heuristic. */
  findRecentClassifiedWithDescription(
    userId: number,
    take: number,
  ): Promise<
    { description: string | null; category: BudgetCategory | null }[]
  > {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        reviewStatus: TransactionReviewStatus.Confirmed,
        category: { not: null },
        description: { not: null },
      },
      select: { description: true, category: true },
      orderBy: { date: 'desc' },
      take,
    });
  }

  async countConfirmedByCategory(
    userId: number,
  ): Promise<{ category: BudgetCategory; count: number }[]> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['category'],
      where: {
        userId,
        reviewStatus: TransactionReviewStatus.Confirmed,
        category: { not: null },
      },
      _count: { _all: true },
    });
    return rows
      .filter((row) => row.category !== null)
      .map((row) => ({
        category: row.category as BudgetCategory,
        count: row._count._all,
      }));
  }

  findManyByUser(userId: number, filters: TransactionFilters = {}) {
    return this.prisma.transaction.findMany({
      where: this.buildListWhere(userId, filters),
      orderBy: { date: 'desc' },
    });
  }

  /** Same rows as `findManyByUser`, plus the names the `GET /transactions`
   * list needs to label each row (fixed expense it pays, bank it came
   * from). Kept separate so internal callers don't pay for the joins. */
  findManyByUserWithLabels(userId: number, filters: TransactionFilters = {}) {
    return this.prisma.transaction.findMany({
      where: this.buildListWhere(userId, filters),
      include: {
        fixedExpense: { select: { name: true } },
        institution: { select: { name: true } },
        ...WALLET_CARD_LABEL,
      },
      orderBy: { date: 'desc' },
    });
  }

  private buildListWhere(userId: number, filters: TransactionFilters) {
    const { from, to, reviewStatus } = filters;

    return {
      userId,
      ...((from || to) && {
        date: {
          ...(from && { gte: from }),
          ...(to && { lte: to }),
        },
      }),
      ...(reviewStatus &&
        reviewStatus.length > 0 && {
          reviewStatus: { in: reviewStatus },
        }),
    };
  }

  /**
   * For a set of (presumably `source: Manual`) transaction ids, returns the
   * still-unresolved `PossibleDuplicate` `ProcessedEmail` pointing at each
   * one — at most one row per transaction id in practice (the Gmail pipeline
   * only ever records one outcome per message, and a given transaction is
   * unlikely to collide with more than one incoming email), but callers
   * should still treat this as "latest wins" rather than assume uniqueness.
   */
  findPossibleDuplicatesFor(
    transactionIds: number[],
  ): Promise<PossibleDuplicateRow[]> {
    if (transactionIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.processedEmail.findMany({
      where: {
        relatedTransactionId: { in: transactionIds },
        result: ProcessedEmailResult.PossibleDuplicate,
        resolvedAt: null,
      },
      select: {
        id: true,
        relatedTransactionId: true,
        senderEmail: true,
        processedAt: true,
      },
      orderBy: { processedAt: 'desc' },
    }) as Promise<PossibleDuplicateRow[]>;
  }

  /** Cheap count for the review-queue summary badge — no rows fetched. */
  countByReviewStatus(
    userId: number,
    reviewStatus: TransactionReviewStatus[],
  ): Promise<number> {
    return this.prisma.transaction.count({
      where: { userId, reviewStatus: { in: reviewStatus } },
    });
  }

  /** Includes the institution's `parserKey`: `TransactionsService.update`
   * needs it to decide whether a category can be learned as a MerchantRule. */
  findOneOwned(id: number, userId: number) {
    return this.prisma.transaction.findFirst({
      where: { id, userId },
      include: { institution: { select: { parserKey: true } } },
    });
  }

  update(id: number, data: UpdateTransactionInput) {
    return this.prisma.transaction.update({
      where: { id },
      data,
      include: WALLET_CARD_LABEL,
    });
  }

  delete(id: number) {
    return this.prisma.transaction.delete({
      where: { id },
      include: WALLET_CARD_LABEL,
    });
  }

  findLatestBySource(
    userId: number,
    source: MovementSource,
  ): Promise<LatestShortcutTransaction | null> {
    return this.prisma.transaction.findFirst({
      where: { userId, source },
      select: {
        id: true,
        description: true,
        amount: true,
        date: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
