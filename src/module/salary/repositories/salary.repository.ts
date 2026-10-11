import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';
import { endOfMonth, startOfMonth } from 'date-fns';
import {
  IncomeReviewStatus,
  IncomeType,
  MovementSource,
  ProcessedEmailResult,
} from '@prisma/client';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto';
import { UpdateSalaryInput } from '../domain/dto/update-salary.dto';
import { CreateGmailSalaryInput } from '../services/salary.service';

export interface SalaryFilters {
  status?: IncomeReviewStatus[];
}

/** Raw shape of an unresolved `PossibleDuplicate` `ProcessedEmail` pointing
 * at a given salary row. Implemented for schema consistency with
 * transactions (see `TransactionsRepository.findPossibleDuplicatesFor`) —
 * currently dead code in production since no parsed transaction type maps
 * to `kind: 'income'` yet (`transaction-type-mapping.ts`), so this list is
 * always empty today. */
export interface SalaryPossibleDuplicateRow {
  id: number;
  relatedSalaryId: number;
  senderEmail: string | null;
  processedAt: Date;
}

@Injectable()
export class SalaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, data: CreateSalaryDto) {
    return this.prisma.salary.create({
      data: {
        userId,
        amount: data.amount,
        date: data.date,
        type: data.type,
        budgetCategory: data.budgetCategory,
        distributeAutomatically: data.distributeAutomatically,
      },
    });
  }

  createFromGmail(userId: number, data: CreateGmailSalaryInput) {
    return this.prisma.salary.create({
      data: {
        userId,
        amount: data.amount,
        date: data.date,
        // Extra, not Payroll — see the comment on
        // SalaryService.createFromGmail for why.
        type: IncomeType.Extra,
        institutionId: data.institutionId,
        gmailMessageId: data.gmailMessageId,
        source: MovementSource.Gmail,
        status: IncomeReviewStatus.PendingReview,
      },
    });
  }

  findManyByUser(userId: number, filters: SalaryFilters = {}) {
    const { status } = filters;

    return this.prisma.salary.findMany({
      where: {
        userId,
        ...(status && status.length > 0 && { status: { in: status } }),
      },
      orderBy: { date: 'asc' },
    });
  }

  /** See the type doc above — implemented for consistency, unreachable with
   * real data today. */
  findPossibleDuplicatesFor(
    salaryIds: number[],
  ): Promise<SalaryPossibleDuplicateRow[]> {
    if (salaryIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.processedEmail.findMany({
      where: {
        relatedSalaryId: { in: salaryIds },
        result: ProcessedEmailResult.PossibleDuplicate,
        resolvedAt: null,
      },
      select: {
        id: true,
        relatedSalaryId: true,
        senderEmail: true,
        processedAt: true,
      },
      orderBy: { processedAt: 'desc' },
    }) as Promise<SalaryPossibleDuplicateRow[]>;
  }

  /** Cheap count for the review-queue summary badge — no rows fetched. */
  countByStatus(userId: number, status: IncomeReviewStatus[]): Promise<number> {
    return this.prisma.salary.count({
      where: { userId, status: { in: status } },
    });
  }

  findOneOwned(id: number, userId: number) {
    return this.prisma.salary.findFirst({
      where: { id, userId },
    });
  }

  update(id: number, data: UpdateSalaryInput) {
    return this.prisma.salary.update({
      where: { id },
      data,
    });
  }

  async getUserSalaryDetails(userId: number) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        salary: {
          where: {
            date: {
              gte: startOfMonth(now),
              lte: endOfMonth(now),
            },
          },
          select: {
            amount: true,
            date: true,
            type: true,
            budgetCategory: true,
            distributeAutomatically: true,
          },
          orderBy: { date: 'asc' },
        },
      },
    });
    return user;
  }
}
