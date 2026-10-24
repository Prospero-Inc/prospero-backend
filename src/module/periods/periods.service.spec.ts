import { NotFoundException } from '@nestjs/common';
import { IncomeType, PeriodOverride } from '@prisma/client';
import { PeriodsService } from './periods.service';
import { INITIAL_PERIOD_KEY } from './period.util';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

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
