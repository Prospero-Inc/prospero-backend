import { NotFoundException } from '@nestjs/common';
import {
  BudgetCategory,
  IncomeType,
  PayFrequency,
  PeriodOverride,
} from '@prisma/client';
import { PeriodsService } from './periods.service';
import { INITIAL_PERIOD_KEY } from './period.util';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('PeriodsService month summary', () => {
  it('sums the calendar month containing `now`, counting payrolls', async () => {
    const salaryService = {
      findAllForUser: jest.fn().mockResolvedValue([
        { type: IncomeType.Payroll, amount: 500, date: d('2026-10-01') },
        { type: IncomeType.Payroll, amount: 500, date: d('2026-10-15') },
        { type: IncomeType.Extra, amount: 50, date: d('2026-10-20') },
        { type: IncomeType.Payroll, amount: 500, date: d('2026-09-30') },
      ]),
    };
    const transactionsService = {
      findAllForUser: jest.fn().mockResolvedValue([
        { amount: 20, date: d('2026-10-31') },
        { amount: 9.99, date: new Date('2026-10-21T14:04:54.000Z') },
        { amount: 100, date: d('2026-11-01') },
      ]),
    };
    const service = new PeriodsService(
      {} as any,
      salaryService as any,
      transactionsService as any,
    );

    const result = await service.getMonthSummary(
      5,
      new Date(2026, 9, 24, 12, 0, 0),
    );

    // Raw floats, like the period summaries — the frontend formats them.
    expect(result).toMatchObject({
      year: 2026,
      month: 10,
      income: 1050,
      payrollCount: 2,
    });
    expect(result.totalSpent).toBeCloseTo(29.99);
    expect(result.balance).toBeCloseTo(1020.01);
  });
});

describe('PeriodsService movement lists', () => {
  // Payrolls on 09-14 and 09-26 → periods: initial, [09-14, 09-25], [09-26, open)
  const salaries = [
    { id: 1, type: IncomeType.Payroll, date: d('2026-09-14') },
    { id: 2, type: IncomeType.Payroll, date: d('2026-09-26') },
    { id: 3, type: IncomeType.Extra, date: d('2026-09-20') },
  ];
  const transactions = [
    { id: 10, date: d('2026-09-15'), periodOverride: null },
    { id: 11, date: d('2026-09-27'), periodOverride: null },
    // Dated in the open period but forced into the previous one.
    { id: 12, date: d('2026-09-28'), periodOverride: PeriodOverride.Previous },
    { id: 13, date: d('2026-09-01'), periodOverride: null },
  ];

  let service: PeriodsService;

  beforeEach(() => {
    const salaryService = {
      findAllForUser: jest.fn().mockResolvedValue(salaries),
      findAllForUserWithPossibleDuplicates: jest
        .fn()
        .mockResolvedValue(salaries),
    };
    const transactionsService = {
      findAllForUserWithPossibleDuplicates: jest
        .fn()
        .mockResolvedValue(transactions),
    };
    service = new PeriodsService(
      {} as any,
      salaryService as any,
      transactionsService as any,
    );
  });

  it('defaults to the current (open) period', async () => {
    const result = await service.listTransactionsForPeriod(5);
    expect(result.map((t) => t.id)).toEqual([11]);
  });

  it('assigns overridden transactions the same way the period summary does', async () => {
    const result = await service.listTransactionsForPeriod(5, '2026-09-14');
    expect(result.map((t) => t.id)).toEqual([10, 12]);
  });

  it('supports the initial period key', async () => {
    const result = await service.listTransactionsForPeriod(
      5,
      INITIAL_PERIOD_KEY,
    );
    expect(result.map((t) => t.id)).toEqual([13]);
  });

  it('throws NotFound for a key that is not a period start', async () => {
    await expect(
      service.listTransactionsForPeriod(5, '2026-09-15'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists the incomes that fall inside the period, Extra included', async () => {
    const result = await service.listSalariesForPeriod(5, '2026-09-14');
    expect(result.map((s) => s.id)).toEqual([1, 3]);
  });
});

/**
 * Characterization tests (plan-rendimiento B3): pin today's behavior of the
 * period summaries before optimizing how they're computed.
 */
describe('PeriodsService period summaries', () => {
  const near = (n: number) => expect.closeTo(n, 6);
  const budgetOf = (
    budgeted: [number, number, number],
    spent: [number, number, number],
  ) => ({
    necesidad: {
      budgeted: near(budgeted[0]),
      spent: near(spent[0]),
      remaining: near(budgeted[0] - spent[0]),
    },
    deseo: {
      budgeted: near(budgeted[1]),
      spent: near(spent[1]),
      remaining: near(budgeted[1] - spent[1]),
    },
    ahorro: {
      budgeted: near(budgeted[2]),
      spent: near(spent[2]),
      remaining: near(budgeted[2] - spent[2]),
    },
  });

  const baseUser = {
    needsPercent: 0.4,
    wantsPercent: 0.3,
    savingsPercent: 0.3,
    payFrequency: PayFrequency.Biweekly as PayFrequency,
  };

  const salary = (
    id: number,
    date: string,
    amount: number,
    type: IncomeType = IncomeType.Payroll,
    extra: Partial<{
      budgetCategory: BudgetCategory | null;
      distributeAutomatically: boolean;
    }> = {},
  ) => ({
    id,
    date: d(date),
    amount,
    type,
    budgetCategory: null,
    distributeAutomatically: false,
    ...extra,
  });

  const tx = (
    id: number,
    date: Date | string,
    amount: number,
    category: BudgetCategory | null,
    periodOverride: PeriodOverride | null = null,
  ) => ({
    id,
    date: typeof date === 'string' ? d(date) : date,
    amount,
    category,
    periodOverride,
  });

  // Payrolls 10-01, 10-15, 10-31 → initial (..09-30), P1 [10-01, 10-14],
  // P2 [10-15, 10-30], P3 [10-31, open).
  const salaries = [
    salary(1, '2026-10-01', 1000),
    salary(2, '2026-10-15', 1000),
    salary(3, '2026-10-31', 1000),
    // Extra earmarked to Ahorro: 100% to that category, no new period.
    salary(4, '2026-10-20', 200, IncomeType.Extra, {
      budgetCategory: BudgetCategory.Ahorro,
    }),
    // Extra distributed by the percentage split.
    salary(5, '2026-11-02', 100, IncomeType.Extra, {
      distributeAutomatically: true,
    }),
  ];
  const transactions = [
    tx(1, '2026-09-20', 50, BudgetCategory.Necesidad),
    tx(2, '2026-10-05', 30, BudgetCategory.Deseo),
    tx(3, '2026-10-16', 100, BudgetCategory.Necesidad),
    tx(4, '2026-10-17', 40, BudgetCategory.Deseo, PeriodOverride.Previous),
    tx(5, '2026-10-03', 70, BudgetCategory.Ahorro, PeriodOverride.Current),
    // Gmail row pending classification: spends, but in no category.
    tx(6, '2026-11-03', 25, null),
    tx(7, '2026-11-01', 60, BudgetCategory.Necesidad),
    // Previous from the initial period stays in the initial period.
    tx(8, '2026-09-25', 10, BudgetCategory.Deseo, PeriodOverride.Previous),
    tx(9, '2026-11-04', 15, BudgetCategory.Deseo, PeriodOverride.Previous),
    // On a payday → the period that payday opens.
    tx(10, '2026-10-15', 5, BudgetCategory.Necesidad),
    // Time of day is ignored: still 10-14 (UTC) → P1.
    tx(11, new Date('2026-10-14T20:30:00.000Z'), 1, BudgetCategory.Deseo),
  ];

  // Exact day counts aren't pinned here: today they depend on the process
  // timezone (plan B4), so they get their own tests once that's fixed.
  const anyDays = expect.any(Number);

  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-11-05T12:00:00.000Z') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function buildService(
    fixture: {
      user?: Partial<typeof baseUser>;
      salaries?: ReturnType<typeof salary>[];
      transactions?: ReturnType<typeof tx>[];
    } = {},
  ) {
    const user = { ...baseUser, ...fixture.user };
    const rows = {
      salaries: fixture.salaries ?? salaries,
      transactions: fixture.transactions ?? transactions,
    };
    const userService = { findById: jest.fn().mockResolvedValue(user) };
    const salaryService = {
      findAllForUser: jest.fn().mockResolvedValue(rows.salaries),
    };
    const transactionsService = {
      findAllForUser: jest.fn().mockResolvedValue(rows.transactions),
    };
    return new PeriodsService(
      userService as any,
      salaryService as any,
      transactionsService as any,
    );
  }

  it('summarizes the open period with overrides, Extra and pending rows', async () => {
    const result = await buildService().getCurrentPeriodSummary(5);

    expect(result).toEqual({
      key: '2026-10-31',
      startDate: d('2026-10-31'),
      endDate: null,
      isOpen: true,
      income: 1100,
      totalSpent: 155,
      balance: 945,
      budget: budgetOf([440, 330, 330], [60, 0, 70]),
      daysElapsed: anyDays,
      estimatedNextPaymentDate: d('2026-11-15'),
      estimatedDaysRemaining: anyDays,
      recentTransactions: [6, 7, 5].map((id) =>
        expect.objectContaining({ id }),
      ),
    });
  });

  it('estimates the next payment a month later for monthly pay', async () => {
    const result = await buildService({
      user: { payFrequency: PayFrequency.Monthly },
    }).getCurrentPeriodSummary(5);

    expect(result.estimatedNextPaymentDate).toEqual(d('2026-11-30'));
  });

  it('caps recentTransactions at the 10 newest of the open period', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      tx(100 + i, `2026-11-${String(i + 1).padStart(2, '0')}`, 1, null),
    );
    const result = await buildService({
      transactions: many,
    }).getCurrentPeriodSummary(5);

    expect(result.recentTransactions.map((t) => t.id)).toEqual([
      111, 110, 109, 108, 107, 106, 105, 104, 103, 102,
    ]);
    expect(result.totalSpent).toBe(12);
  });

  it('lists every period newest first with its own totals', async () => {
    const result = await buildService().listPeriods(5);

    expect(result.map((p) => p.key)).toEqual([
      '2026-10-31',
      '2026-10-15',
      '2026-10-01',
      INITIAL_PERIOD_KEY,
    ]);
    const [open, p2, p1, initial] = result;

    expect(open).toMatchObject({
      isOpen: true,
      income: 1100,
      totalSpent: 155,
      daysElapsed: anyDays,
      estimatedNextPaymentDate: d('2026-11-15'),
      estimatedDaysRemaining: anyDays,
    });
    expect(open.recentTransactions.map((t) => t.id)).toEqual([6, 7, 5]);

    expect(p2).toMatchObject({
      startDate: d('2026-10-15'),
      endDate: d('2026-10-30'),
      isOpen: false,
      income: 1200,
      totalSpent: 120,
      balance: 1080,
      budget: budgetOf([400, 300, 500], [105, 15, 0]),
      daysElapsed: anyDays,
      estimatedNextPaymentDate: null,
      estimatedDaysRemaining: null,
    });

    expect(p1).toMatchObject({
      startDate: d('2026-10-01'),
      endDate: d('2026-10-14'),
      isOpen: false,
      income: 1000,
      totalSpent: 71,
      balance: 929,
      budget: budgetOf([400, 300, 300], [0, 71, 0]),
      daysElapsed: anyDays,
      estimatedNextPaymentDate: null,
      estimatedDaysRemaining: null,
    });

    expect(initial).toMatchObject({
      startDate: null,
      endDate: d('2026-09-30'),
      isOpen: false,
      income: 0,
      totalSpent: 60,
      balance: -60,
      budget: budgetOf([0, 0, 0], [50, 10, 0]),
      daysElapsed: null,
      estimatedNextPaymentDate: null,
      estimatedDaysRemaining: null,
    });
  });

  it('agrees with listPeriods on the current period', async () => {
    const service = buildService();
    const [current, list] = await Promise.all([
      service.getCurrentPeriodSummary(5),
      service.listPeriods(5),
    ]);
    expect(list[0]).toEqual(current);
  });

  describe('user without any Payroll', () => {
    const fixture = {
      salaries: [salary(1, '2026-11-01', 300, IncomeType.Extra)],
      transactions: [
        tx(1, '2026-10-10', 20, BudgetCategory.Necesidad),
        tx(2, '2026-11-02', 5, BudgetCategory.Deseo, PeriodOverride.Previous),
        tx(3, '2026-11-03', 7, null, PeriodOverride.Current),
      ],
    };

    it('has a single open initial period holding everything', async () => {
      const result = await buildService(fixture).getCurrentPeriodSummary(5);

      expect(result).toEqual({
        key: INITIAL_PERIOD_KEY,
        startDate: null,
        endDate: null,
        isOpen: true,
        income: 300,
        totalSpent: 32,
        balance: 268,
        budget: budgetOf([120, 90, 90], [20, 5, 0]),
        daysElapsed: null,
        estimatedNextPaymentDate: null,
        estimatedDaysRemaining: null,
        recentTransactions: [3, 2, 1].map((id) =>
          expect.objectContaining({ id }),
        ),
      });
    });

    it('lists just that period', async () => {
      const result = await buildService(fixture).listPeriods(5);
      expect(result.map((p) => p.key)).toEqual([INITIAL_PERIOD_KEY]);
      expect(result[0].totalSpent).toBe(32);
    });
  });
});

/** plan-rendimiento B4: "today" is the El Salvador date, whatever the
 * process timezone (run under TZ=America/El_Salvador and TZ=UTC). */
describe('PeriodsService day counts', () => {
  function serviceWithPaydays(...dates: string[]) {
    return new PeriodsService(
      {
        findById: jest.fn().mockResolvedValue({
          needsPercent: 0.5,
          wantsPercent: 0.3,
          savingsPercent: 0.2,
          payFrequency: PayFrequency.Biweekly,
        }),
      } as any,
      {
        findAllForUser: jest.fn().mockResolvedValue(
          dates.map((date, id) => ({
            id,
            date: d(date),
            amount: 500,
            type: IncomeType.Payroll,
          })),
        ),
      } as any,
      { findAllForUser: jest.fn().mockResolvedValue([]) } as any,
    );
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['08:00 on payday', '2026-10-31T14:00:00.000Z', 0, 15],
    ['20:00 on payday (next day in UTC)', '2026-11-01T02:00:00.000Z', 0, 15],
    ['00:30 the day after', '2026-11-01T06:30:00.000Z', 1, 14],
  ])(
    '%s (%s) → elapsed %i, remaining %i',
    async (_, now, elapsed, remaining) => {
      jest.useFakeTimers({ now: new Date(now) });
      const service = serviceWithPaydays('2026-10-15', '2026-10-31');

      const current = await service.getCurrentPeriodSummary(5);
      expect(current.daysElapsed).toBe(elapsed);
      expect(current.estimatedDaysRemaining).toBe(remaining);

      const [, previous] = await service.listPeriods(5);
      expect(previous.daysElapsed).toBe(16 + elapsed);
    },
  );
});
