import { PayFrequency, PeriodOverride } from '@prisma/client';
import {
  assignToPeriods,
  computePeriods,
  estimateNextPaymentDate,
  findPeriodByKey,
  INITIAL_PERIOD_KEY,
  periodKey,
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

describe('periodKey / findPeriodByKey', () => {
  const periods = computePeriods([d('2026-09-14'), d('2026-09-26')]);

  it('keys dated periods by their start date and the first one as initial', () => {
    expect(periods.map(periodKey)).toEqual([
      INITIAL_PERIOD_KEY,
      '2026-09-14',
      '2026-09-26',
    ]);
  });

  it('finds a period by its key and returns undefined for an unknown one', () => {
    expect(findPeriodByKey(periods, '2026-09-14')?.index).toBe(1);
    expect(findPeriodByKey(periods, INITIAL_PERIOD_KEY)?.index).toBe(0);
    expect(findPeriodByKey(periods, '2026-09-15')).toBeUndefined();
  });
});

describe('assignToPeriods', () => {
  /** Seeded PRNG (mulberry32), so a failure is reproducible. */
  function random(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** The reference: what `resolveTransactionPeriod` assigns, row by row. */
  function naive(
    periods: ReturnType<typeof computePeriods>,
    rows: { date: Date; periodOverride?: PeriodOverride | null }[],
  ) {
    return periods.map((period) =>
      rows.filter(
        (row) =>
          resolveTransactionPeriod(periods, row.date, row.periodOverride)
            .index === period.index,
      ),
    );
  }

  const base = d('2025-01-01').getTime();
  const DAY = 86_400_000;
  const overrides = [
    null,
    undefined,
    PeriodOverride.Previous,
    PeriodOverride.Current,
  ];

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
    'matches resolveTransactionPeriod on random data (seed %i)',
    (seed) => {
      const rand = random(seed);
      const payrollCount = Math.floor(rand() * 30); // 0 → no-payroll user
      // Random times of day, unsorted, with repeated paydays now and then.
      const payrolls = Array.from(
        { length: payrollCount },
        () => new Date(base + Math.floor(rand() * 400) * DAY + rand() * DAY),
      );
      if (payrollCount > 1) payrolls.push(new Date(payrolls[0].getTime()));
      const periods = computePeriods(payrolls);
      const rows = Array.from({ length: 500 }, (_, id) => ({
        id,
        // Also before the first and after the last payday.
        date: new Date(
          base + Math.floor(rand() * 460 - 30) * DAY + rand() * DAY,
        ),
        periodOverride: overrides[Math.floor(rand() * overrides.length)],
      }));

      expect(assignToPeriods(periods, rows)).toEqual(naive(periods, rows));
    },
  );

  it('puts a row on a payday in the period that payday opens', () => {
    const periods = computePeriods([d('2026-09-13'), d('2026-09-27')]);
    const buckets = assignToPeriods(periods, [
      { date: d('2026-09-12') },
      { date: new Date('2026-09-13T23:59:00.000Z') },
      { date: d('2026-09-27') },
    ]);

    expect(buckets.map((rows) => rows.length)).toEqual([1, 1, 1]);
  });

  it('applies overrides like resolveTransactionPeriod', () => {
    const periods = computePeriods([d('2026-09-13'), d('2026-09-27')]);
    const buckets = assignToPeriods(periods, [
      { date: d('2026-09-01'), periodOverride: PeriodOverride.Previous },
      { date: d('2026-09-28'), periodOverride: PeriodOverride.Previous },
      { date: d('2026-09-01'), periodOverride: PeriodOverride.Current },
    ]);

    expect(buckets.map((rows) => rows.length)).toEqual([1, 1, 1]);
    expect(buckets[2][0].date).toEqual(d('2026-09-01'));
  });
});
