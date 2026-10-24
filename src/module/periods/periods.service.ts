import { Injectable, NotFoundException } from '@nestjs/common';
import { differenceInCalendarDays } from 'date-fns';
import { IncomeType, Salary, Transaction } from '@prisma/client';
import { UserService } from '../user/user.service';
import {
  SalaryService,
  SalaryWithPossibleDuplicate,
} from '../salary/services/salary.service';
import {
  TransactionsService,
  TransactionWithPossibleDuplicate,
} from '../transactions/services/transactions.service';
import { CustomStrategy } from '../salary/strategies/custom.strategy';
import {
  ComputedPeriod,
  computePeriods,
  estimateNextPaymentDate,
  findPeriodByKey,
  periodKey,
  resolvePeriodForDate,
  resolveTransactionPeriod,
} from './period.util';
import {
  CATEGORY_TO_BUDGET_KEY,
  distributeIncomeByCategory,
} from './income-distribution.util';

export interface PeriodSummary {
  /** See `periodKey`: what `?period=` expects on the movement endpoints. */
  key: string;
  startDate: Date | null;
  endDate: Date | null;
  isOpen: boolean;
  income: number;
  totalSpent: number;
  balance: number;
  budget: Record<
    'necesidad' | 'deseo' | 'ahorro',
    { budgeted: number; spent: number; remaining: number }
  >;
  daysElapsed: number | null;
  estimatedNextPaymentDate: Date | null;
  estimatedDaysRemaining: number | null;
  recentTransactions: Transaction[];
}

@Injectable()
export class PeriodsService {
  constructor(
    private readonly userService: UserService,
    private readonly salaryService: SalaryService,
    private readonly transactionsService: TransactionsService,
  ) {}

  private async loadContext(userId: number) {
    const [user, salaries, transactions] = await Promise.all([
      this.userService.findById(userId),
      this.salaryService.findAllForUser(userId),
      this.transactionsService.findAllForUser(userId),
    ]);

    return {
      user,
      salaries,
      transactions,
      periods: this.computeUserPeriods(salaries),
    };
  }

  private computeUserPeriods(salaries: Salary[]): ComputedPeriod[] {
    return computePeriods(
      salaries
        .filter((salary) => salary.type === IncomeType.Payroll)
        .map((salary) => salary.date),
    );
  }

  /** `key` omitted → the current (open) period. */
  private selectPeriod(periods: ComputedPeriod[], key?: string) {
    if (!key) {
      return periods[periods.length - 1];
    }
    const period = findPeriodByKey(periods, key);
    if (!period) {
      throw new NotFoundException('Period not found');
    }
    return period;
  }

  private summarizePeriod(
    period: ComputedPeriod,
    periods: ComputedPeriod[],
    salaries: Salary[],
    transactions: Transaction[],
    strategy: CustomStrategy,
    frequency: Parameters<typeof estimateNextPaymentDate>[1],
  ): PeriodSummary {
    const periodIncomes = salaries.filter(
      (salary) =>
        resolvePeriodForDate(periods, salary.date).index === period.index,
    );
    const periodTransactions = transactions.filter(
      (transaction) =>
        resolveTransactionPeriod(
          periods,
          transaction.date,
          transaction.periodOverride,
        ).index === period.index,
    );

    const income = periodIncomes.reduce(
      (sum, salary) => sum + salary.amount,
      0,
    );
    const totalSpent = periodTransactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );

    // Extra income earmarked to a single budget category (budgetCategory set,
    // distributeAutomatically left false) is assigned 100% to that category
    // instead of going through the percentage split; everything else
    // (all Payroll, plus non-earmarked Extra) is distributed by `strategy`
    // exactly like before this existed. See income-distribution.util.ts.
    const budgeted = distributeIncomeByCategory(periodIncomes, strategy);
    const spentByCategory = periodTransactions.reduce(
      (acc, transaction) => {
        // Gmail-detected transactions pending classification have no
        // category yet; they don't count toward any bucket until classified.
        if (!transaction.category) {
          return acc;
        }
        const key = CATEGORY_TO_BUDGET_KEY[transaction.category];
        acc[key] += transaction.amount;
        return acc;
      },
      { necesidad: 0, deseo: 0, ahorro: 0 },
    );

    const budget = {
      necesidad: {
        budgeted: budgeted.necesidad,
        spent: spentByCategory.necesidad,
        remaining: budgeted.necesidad - spentByCategory.necesidad,
      },
      deseo: {
        budgeted: budgeted.deseo,
        spent: spentByCategory.deseo,
        remaining: budgeted.deseo - spentByCategory.deseo,
      },
      ahorro: {
        budgeted: budgeted.ahorro,
        spent: spentByCategory.ahorro,
        remaining: budgeted.ahorro - spentByCategory.ahorro,
      },
    };

    const lastPayrollDate = period.isOpen ? period.startDate : null;
    const estimatedNextPaymentDate = lastPayrollDate
      ? estimateNextPaymentDate(lastPayrollDate, frequency)
      : null;

    return {
      key: periodKey(period),
      startDate: period.startDate,
      endDate: period.endDate,
      isOpen: period.isOpen,
      income,
      totalSpent,
      balance: income - totalSpent,
      budget,
      daysElapsed: period.startDate
        ? differenceInCalendarDays(new Date(), period.startDate)
        : null,
      estimatedNextPaymentDate,
      estimatedDaysRemaining: estimatedNextPaymentDate
        ? differenceInCalendarDays(estimatedNextPaymentDate, new Date())
        : null,
      recentTransactions: [...periodTransactions]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 10),
    };
  }

  async getCurrentPeriodSummary(userId: number): Promise<PeriodSummary> {
    const { user, salaries, transactions, periods } =
      await this.loadContext(userId);
    const strategy = new CustomStrategy(
      user.needsPercent,
      user.wantsPercent,
      user.savingsPercent,
    );
    const current = periods[periods.length - 1];

    return this.summarizePeriod(
      current,
      periods,
      salaries,
      transactions,
      strategy,
      user.payFrequency,
    );
  }

  async listPeriods(userId: number): Promise<PeriodSummary[]> {
    const { user, salaries, transactions, periods } =
      await this.loadContext(userId);
    const strategy = new CustomStrategy(
      user.needsPercent,
      user.wantsPercent,
      user.savingsPercent,
    );

    return [...periods]
      .reverse()
      .map((period) =>
        this.summarizePeriod(
          period,
          periods,
          salaries,
          transactions,
          strategy,
          user.payFrequency,
        ),
      );
  }

  /** Same rows (and shape) as `GET /transactions`, limited to the ones that
   * count toward the given period — `periodOverride` included, exactly as
   * `summarizePeriod` assigns them, so the list adds up to the dashboard. */
  async listTransactionsForPeriod(
    userId: number,
    key?: string,
  ): Promise<TransactionWithPossibleDuplicate[]> {
    const [salaries, transactions] = await Promise.all([
      this.salaryService.findAllForUser(userId),
      this.transactionsService.findAllForUserWithPossibleDuplicates(userId),
    ]);
    const periods = this.computeUserPeriods(salaries);
    const target = this.selectPeriod(periods, key);

    return transactions.filter(
      (transaction) =>
        resolveTransactionPeriod(
          periods,
          transaction.date,
          transaction.periodOverride,
        ).index === target.index,
    );
  }

  /** Same rows (and shape) as `GET /salary`, limited to the given period. */
  async listSalariesForPeriod(
    userId: number,
    key?: string,
  ): Promise<SalaryWithPossibleDuplicate[]> {
    const salaries =
      await this.salaryService.findAllForUserWithPossibleDuplicates(userId);
    const periods = this.computeUserPeriods(salaries);
    const target = this.selectPeriod(periods, key);

    return salaries.filter(
      (salary) =>
        resolvePeriodForDate(periods, salary.date).index === target.index,
    );
  }
}
