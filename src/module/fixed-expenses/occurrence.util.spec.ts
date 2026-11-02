import {
  resolveLocalDate,
  resolveOccurrenceDate,
  resolveReferenceDate,
} from './occurrence.util';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('resolveOccurrenceDate', () => {
  it('rebuilds the day-of-month in the reference month, regardless of the stored year/month', () => {
    expect(resolveOccurrenceDate(d('2024-01-09'), d('2026-09-20'))).toEqual(
      d('2026-09-09'),
    );
  });

  it('is unaffected by which day of the reference month "today" actually is', () => {
    const dueDate = d('2024-01-18');

    expect(resolveOccurrenceDate(dueDate, d('2026-09-01'))).toEqual(
      d('2026-09-18'),
    );
    expect(resolveOccurrenceDate(dueDate, d('2026-09-30'))).toEqual(
      d('2026-09-18'),
    );
  });

  it('clamps to the last day of a shorter reference month', () => {
    expect(resolveOccurrenceDate(d('2024-01-31'), d('2026-02-10'))).toEqual(
      d('2026-02-28'),
    );
  });
});

describe('resolveReferenceDate', () => {
  // 18:53 on Oct 31 in El Salvador (UTC-6) is already Nov 1 in UTC.
  const now = new Date('2026-11-01T00:53:00.000Z');

  it("uses the user's local date when given", () => {
    expect(resolveReferenceDate('2026-10-31', now)).toEqual(d('2026-10-31'));
  });

  it('falls back to the server date without one', () => {
    expect(resolveReferenceDate(undefined, now)).toBe(now);
  });

  it('ignores dates more than a day away from the server date', () => {
    expect(resolveReferenceDate('2026-09-15', now)).toBe(now);
    expect(resolveReferenceDate('2026-11-03', now)).toBe(now);
  });

  it('ignores impossible dates', () => {
    expect(resolveReferenceDate('2026-02-31', now)).toBe(now);
  });
});

describe('resolveLocalDate', () => {
  it('returns the date in the time zone, as UTC midnight', () => {
    // 20:00 on Nov 29 in El Salvador (UTC-6) is already Nov 30 in UTC.
    expect(
      resolveLocalDate(
        new Date('2026-11-30T02:00:00.000Z'),
        'America/El_Salvador',
      ),
    ).toEqual(d('2026-11-29'));
  });
});
