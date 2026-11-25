/** Users are in El Salvador (UTC-6, no DST): "today" for anything that has
 * no client to send its local date (jobs, server-side day counts). */
export const APP_TIME_ZONE = 'America/El_Salvador';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The calendar date in `timeZone` at `now`, as UTC midnight — the same
 * convention date-only rows (and period/occurrence dates) are stored in. */
export function resolveLocalDate(now: Date, timeZone: string): Date {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
  return new Date(`${local}T00:00:00.000Z`);
}

/** First and last instant of a calendar month (`monthIndex` 0–11) in UTC,
 * for `date` range filters on rows stored at UTC midnight. */
export function utcMonthRange(
  year: number,
  monthIndex: number,
): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, monthIndex, 1)),
    to: new Date(Date.UTC(year, monthIndex + 1, 1) - 1),
  };
}

/** Whole days from `earlier` to `later`, both UTC-midnight dates. Unlike
 * date-fns' differenceInCalendarDays it doesn't read the process timezone. */
export function differenceInUTCDays(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / DAY_MS);
}
