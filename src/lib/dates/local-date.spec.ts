import { differenceInUTCDays, resolveLocalDate } from './local-date';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

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

describe('differenceInUTCDays', () => {
  it('counts whole days between UTC-midnight dates, across months', () => {
    expect(differenceInUTCDays(d('2026-11-15'), d('2026-10-31'))).toBe(15);
    expect(differenceInUTCDays(d('2026-10-31'), d('2026-10-31'))).toBe(0);
    expect(differenceInUTCDays(d('2026-10-30'), d('2026-10-31'))).toBe(-1);
  });
});
