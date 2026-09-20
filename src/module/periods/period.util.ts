import { PayFrequency, PeriodOverride } from '@prisma/client';

export interface ComputedPeriod {
  index: number;
  startDate: Date | null;
  endDate: Date | null;
  isOpen: boolean;
}

// Plain date-fns helpers (addDays/addMonths/startOfDay) operate in the
// process's local timezone, which would make period boundaries depend on
// where this happens to be deployed. These operate on UTC calendar-date
// components only, so a given date always resolves to the same period
// regardless of server timezone.

function startOfUTCDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUTCDays(date: Date, amount: number): Date {
  const result = startOfUTCDay(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function addUTCMonths(date: Date, amount: number): Date {
  const start = startOfUTCDay(date);
  const targetMonthIndex = start.getUTCMonth() + amount;
  const daysInTargetMonth = new Date(
    Date.UTC(start.getUTCFullYear(), targetMonthIndex + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      start.getUTCFullYear(),
      targetMonthIndex,
      Math.min(start.getUTCDate(), daysInTargetMonth),
    ),
  );
}

/**
 * Builds the list of budget periods from a user's Payroll-type income dates.
 * Periods are derived, never stored: editing/adding a payroll date just
 * changes what this function returns on the next read, so there is no
 * explicit "reassign transactions" step anywhere else in the codebase.
 */
export function computePeriods(payrollDates: Date[]): ComputedPeriod[] {
  const sorted = [...payrollDates]
    .map(startOfUTCDay)
    .sort((a, b) => a.getTime() - b.getTime());

  if (sorted.length === 0) {
    return [{ index: 0, startDate: null, endDate: null, isOpen: true }];
  }

  const periods: ComputedPeriod[] = [
    {
      index: 0,
      startDate: null,
      endDate: addUTCDays(sorted[0], -1),
      isOpen: false,
    },
  ];

  sorted.forEach((date, i) => {
    const isLast = i === sorted.length - 1;
    periods.push({
      index: i + 1,
      startDate: date,
      endDate: isLast ? null : addUTCDays(sorted[i + 1], -1),
      isOpen: isLast,
    });
  });

  return periods;
}

function isWithinPeriod(period: ComputedPeriod, date: Date): boolean {
  const day = startOfUTCDay(date);
  const afterStart = !period.startDate || day >= period.startDate;
  const beforeEnd = !period.endDate || day <= period.endDate;
  return afterStart && beforeEnd;
}

/** Finds the period whose date range contains `date`. Always matches exactly
 * one period, since computePeriods produces a contiguous, gapless range. */
export function resolvePeriodForDate(
  periods: ComputedPeriod[],
  date: Date,
): ComputedPeriod {
  const match = periods.find((period) => isWithinPeriod(period, date));
  return match ?? periods[periods.length - 1];
}

/**
 * Resolves the period a transaction actually belongs to, applying its manual
 * override (if any) instead of the plain date-based lookup.
 */
export function resolveTransactionPeriod(
  periods: ComputedPeriod[],
  date: Date,
  override?: PeriodOverride | null,
): ComputedPeriod {
  const natural = resolvePeriodForDate(periods, date);

  if (override === PeriodOverride.Current) {
    return periods[periods.length - 1];
  }

  if (override === PeriodOverride.Previous) {
    const previousIndex = Math.max(0, natural.index - 1);
    return periods[previousIndex];
  }

  return natural;
}

/**
 * Rough, informational-only estimate of the next payment date. Per spec,
 * this never affects which period a transaction belongs to — only the
 * "days remaining" shown on the dashboard — so a simple heuristic is enough.
 */
export function estimateNextPaymentDate(
  lastPaymentDate: Date,
  frequency: PayFrequency,
): Date {
  return frequency === PayFrequency.Monthly
    ? addUTCMonths(lastPaymentDate, 1)
    : addUTCDays(lastPaymentDate, 15);
}
