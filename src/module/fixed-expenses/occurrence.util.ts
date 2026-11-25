function startOfUTCDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * A FixedExpense's dueDate only carries meaning as a day-of-month (e.g. "the
 * 9th") — the stored year/month is just whatever it happened to be created
 * with. This resolves the concrete date that day-of-month falls on in the
 * month containing `referenceDate`, clamped to that month's length, so a
 * bill due the 9th always lands in the same half of the month regardless of
 * which day it's actually marked as paid.
 */
export function resolveOccurrenceDate(
  dueDate: Date,
  referenceDate: Date,
): Date {
  const day = dueDate.getUTCDate();
  const ref = startOfUTCDay(referenceDate);
  const daysInReferenceMonth = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(
      ref.getUTCFullYear(),
      ref.getUTCMonth(),
      Math.min(day, daysInReferenceMonth),
    ),
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Today" for resolving occurrences: the user's local date when the client
 * sends it (YYYY-MM-DD), since the server's UTC date is already tomorrow on
 * an American evening — which made October's paid bills show as unpaid
 * (November's occurrence) and "Pagar" date the payment in November.
 * Ignored unless it's a real date within a day of the server's UTC date
 * (every time zone is), so a wrong client clock can't move the month.
 */
export function resolveReferenceDate(
  localToday: string | undefined,
  now: Date,
): Date {
  if (!localToday) return now;
  const local = new Date(`${localToday}T00:00:00.000Z`);
  if (
    Number.isNaN(local.getTime()) ||
    local.toISOString().slice(0, 10) !== localToday
  )
    return now;
  const distance = Math.abs(local.getTime() - startOfUTCDay(now).getTime());
  return distance <= DAY_MS ? local : now;
}
