import { BudgetCategory, IncomeType, PeriodOverride } from '@prisma/client';
import { PrismaService } from '../src/module/prisma.service';
import { PeriodsService } from '../src/module/periods/periods.service';
import { SalaryRepository } from '../src/module/salary/repositories/salary.repository';
import { SalaryService } from '../src/module/salary/services/salary.service';
import { TransactionsRepository } from '../src/module/transactions/repositories/transactions.repository';
import { TransactionsService } from '../src/module/transactions/services/transactions.service';
import { UserService } from '../src/module/user/user.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

/**
 * plan-rendimiento B2: the narrowed reads (one period's date range plus every
 * overridden row, one month) must add up to the same totals as the full
 * history read by `listPeriods`, against the real Postgres query.
 */
describe('Period reads narrowed by date (Postgres)', () => {
  let prisma: PrismaService;
  let service: PeriodsService;
  let transactionsService: TransactionsService;
  let userId: number;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = Date.now();
    const user = await prisma.user.create({
      data: {
        email: `periods-${stamp}@example.com`,
        username: `periods-${stamp}`,
        needsPercent: 0.4,
        wantsPercent: 0.3,
        savingsPercent: 0.3,
      },
    });
    userId = user.id;

    await prisma.salary.createMany({
      data: [
        ['2026-09-01', IncomeType.Payroll],
        ['2026-09-15', IncomeType.Payroll],
        ['2026-09-30', IncomeType.Payroll],
        ['2026-10-15', IncomeType.Payroll],
        ['2026-09-20', IncomeType.Extra],
        ['2026-10-31', IncomeType.Extra],
      ].map(([date, type]) => ({
        userId,
        amount: 100,
        date: d(date),
        type: type as IncomeType,
      })),
    });
    const tx = (
      date: Date,
      amount: number,
      periodOverride: PeriodOverride | null = null,
    ) => ({
      userId,
      amount,
      date,
      category: BudgetCategory.Necesidad,
      periodOverride,
    });
    await prisma.transaction.createMany({
      data: [
        tx(d('2026-08-20'), 1), // initial period
        tx(d('2026-09-01'), 2), // on a payday
        // Gmail-style time of day on a period's last day.
        tx(new Date('2026-09-14T23:30:00.000Z'), 4),
        tx(d('2026-09-15'), 8),
        // Dated in an old period, pinned to the open one.
        tx(d('2026-08-25'), 16, PeriodOverride.Current),
        // Dated in the open period, pinned to the previous one.
        tx(d('2026-10-20'), 32, PeriodOverride.Previous),
        tx(d('2026-10-01'), 64, PeriodOverride.Previous),
        tx(d('2026-10-31'), 128),
        tx(d('2026-11-01'), 256),
      ],
    });

    const salaryService = new SalaryService(new SalaryRepository(prisma));
    transactionsService = new TransactionsService(
      new TransactionsRepository(prisma),
      {} as any,
    );
    service = new PeriodsService(
      new UserService(prisma, {} as any),
      salaryService,
      transactionsService,
    );
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.salary.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('matches the full-history totals for every period', async () => {
    const periods = await service.listPeriods(userId);
    // open [10-15, …) · [09-30, 10-14] · [09-15, 09-29] · [09-01, 09-14] · initial
    expect(periods.map((p) => p.totalSpent)).toEqual([
      128 + 256 + 16,
      32,
      8 + 64,
      2 + 4,
      1,
    ]);
    expect(periods.map((p) => p.income)).toEqual([200, 100, 200, 100, 0]);

    for (const period of periods) {
      const [transactions, salaries] = await Promise.all([
        service.listTransactionsForPeriod(userId, period.key),
        service.listSalariesForPeriod(userId, period.key),
      ]);
      expect(transactions.reduce((sum, t) => sum + t.amount, 0)).toBe(
        period.totalSpent,
      );
      expect(salaries.reduce((sum, s) => sum + s.amount, 0)).toBe(
        period.income,
      );
    }

    const current = await service.getCurrentPeriodSummary(userId);
    expect(current).toEqual(periods[0]);
  });

  it('narrows the transactions read to the range plus overridden rows', async () => {
    const rows = await transactionsService.findAllForUser(userId, {
      from: d('2026-09-15'),
      to: new Date('2026-09-29T23:59:59.999Z'),
      includeOverridden: true,
    });
    expect(rows.map((t) => t.amount).sort((a, b) => a - b)).toEqual([
      8, 16, 32, 64,
    ]);
  });

  it('reads one calendar month for the month summary', async () => {
    const result = await service.getMonthSummary(
      userId,
      new Date(2026, 9, 24, 12, 0, 0),
    );
    expect(result).toMatchObject({
      income: 200,
      payrollCount: 1,
      totalSpent: 32 + 64 + 128,
    });
  });

  it('reads only the fixed-expense payments of the month', async () => {
    const fixedExpense = await prisma.fixedExpense.create({
      data: {
        userId,
        name: 'Renta',
        amount: 300,
        dueDate: d('2026-01-05'),
        budgetCategory: BudgetCategory.Necesidad,
        reminder: false,
      },
    });
    await prisma.transaction.createMany({
      data: ['2026-09-30', '2026-10-05', '2026-10-31', '2026-11-01'].map(
        (date) => ({
          userId,
          amount: 300,
          date: new Date(`${date}T18:00:00.000Z`),
          fixedExpenseId: fixedExpense.id,
        }),
      ),
    });

    const payments = await transactionsService.findFixedExpensePayments(
      userId,
      d('2026-10-01'),
      new Date('2026-10-31T23:59:59.999Z'),
    );

    expect(
      payments.map((p) => p.date.toISOString().slice(0, 10)).sort(),
    ).toEqual(['2026-10-05', '2026-10-31']);
    await prisma.transaction.deleteMany({
      where: { fixedExpenseId: fixedExpense.id },
    });
    await prisma.fixedExpense.delete({ where: { id: fixedExpense.id } });
  });
});
