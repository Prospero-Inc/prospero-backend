import { Injectable } from '@nestjs/common';
import {
  MovementSource,
  ProcessedEmailResult,
  TransactionReviewStatus,
} from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';
import {
  CreateGmailTransactionInput,
  CreateTransactionInput,
  UpdateTransactionInput,
} from '../services/transactions.service';

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

  findManyByUser(userId: number, filters: TransactionFilters = {}) {
    const { from, to, reviewStatus } = filters;

    return this.prisma.transaction.findMany({
      where: {
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
      },
      orderBy: { date: 'desc' },
    });
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

  findOneOwned(id: number, userId: number) {
    return this.prisma.transaction.findFirst({
      where: { id, userId },
    });
  }

  update(id: number, data: UpdateTransactionInput) {
    return this.prisma.transaction.update({
      where: { id },
      data,
    });
  }

  delete(id: number) {
    return this.prisma.transaction.delete({
      where: { id },
    });
  }
}
