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
