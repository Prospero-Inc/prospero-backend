import { PayFrequency, PeriodOverride } from '@prisma/client';
import {
  computePeriods,
  estimateNextPaymentDate,
  resolvePeriodForDate,
  resolveTransactionPeriod,
} from './period.util';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('computePeriods', () => {
  it('returns a single open period when there is no payroll yet', () => {
    const periods = computePeriods([]);

    expect(periods).toEqual([
      { index: 0, startDate: null, endDate: null, isOpen: true },
    ]);
  });

  it('builds an initial period plus one open period for a single payroll', () => {
    const periods = computePeriods([d('2026-09-13')]);

    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ startDate: null, isOpen: false });
    expect(periods[0].endDate).toEqual(d('2026-09-12'));
    expect(periods[1]).toMatchObject({
      startDate: d('2026-09-13'),
      endDate: null,
      isOpen: true,
    });
  });

  it('chains consecutive periods with no gaps for multiple payrolls, regardless of input order', () => {
    const periods = computePeriods([d('2026-09-28'), d('2026-09-13')]);

    expect(periods.map((p) => p.startDate)).toEqual([
      null,
      d('2026-09-13'),
      d('2026-09-28'),
    ]);
    expect(periods.map((p) => p.endDate)).toEqual([
      d('2026-09-12'),
      d('2026-09-27'),
      null,
    ]);
    expect(periods.map((p) => p.isOpen)).toEqual([false, false, true]);
  });
});

describe('resolvePeriodForDate', () => {
  const periods = computePeriods([d('2026-09-13'), d('2026-09-28')]);

  it('assigns an expense dated before the first payroll to the initial period', () => {
    expect(resolvePeriodForDate(periods, d('2026-09-01')).index).toBe(0);
  });

  it('assigns an expense on the payroll date itself to the new period (spec example)', () => {
    expect(resolvePeriodForDate(periods, d('2026-09-12')).index).toBe(0);
    expect(resolvePeriodForDate(periods, d('2026-09-13')).index).toBe(1);
  });

  it('assigns an expense in the middle of a closed period correctly', () => {
    expect(resolvePeriodForDate(periods, d('2026-09-20')).index).toBe(1);
  });

  it('assigns a recent expense to the open period', () => {
    expect(resolvePeriodForDate(periods, d('2026-10-05')).index).toBe(2);
  });
});

describe('resolveTransactionPeriod (manual override)', () => {
  const periods = computePeriods([d('2026-09-13'), d('2026-09-28')]);

  it('uses the natural period when there is no override', () => {
    expect(resolveTransactionPeriod(periods, d('2026-09-20')).index).toBe(1);
  });

  it('shifts to the previous period when overridden', () => {
    expect(
      resolveTransactionPeriod(
        periods,
        d('2026-09-20'),
        PeriodOverride.Previous,
      ).index,
    ).toBe(0);
  });

  it('forces the currently open period when overridden', () => {
    expect(
      resolveTransactionPeriod(periods, d('2026-09-01'), PeriodOverride.Current)
        .index,
    ).toBe(2);
  });

  it('clamps "previous" at the initial period instead of going out of range', () => {
    expect(
      resolveTransactionPeriod(
        periods,
        d('2026-09-01'),
        PeriodOverride.Previous,
      ).index,
    ).toBe(0);
  });
});

describe('estimateNextPaymentDate', () => {
  it('adds 15 days for biweekly frequency', () => {
    expect(
      estimateNextPaymentDate(d('2026-09-13'), PayFrequency.Biweekly),
    ).toEqual(d('2026-09-28'));
  });

  it('adds a month for monthly frequency, clamped to the last valid day', () => {
    expect(
      estimateNextPaymentDate(d('2026-01-31'), PayFrequency.Monthly),
    ).toEqual(d('2026-02-28'));
  });
});
