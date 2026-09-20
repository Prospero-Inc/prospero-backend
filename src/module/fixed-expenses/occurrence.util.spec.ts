import { resolveOccurrenceDate } from './occurrence.util';

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
