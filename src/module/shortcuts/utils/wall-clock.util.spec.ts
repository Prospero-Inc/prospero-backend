import { resolveOccurredAt, toElSalvadorWallClock } from './wall-clock.util';

describe('toElSalvadorWallClock', () => {
  it('writes the San Salvador wall clock (UTC-6) into the UTC fields', () => {
    expect(
      toElSalvadorWallClock(new Date('2026-11-11T03:30:00.000Z')).toISOString(),
    ).toBe('2026-11-10T21:30:00.000Z');
  });

  it('keeps the same calendar day for an afternoon purchase', () => {
    expect(
      toElSalvadorWallClock(new Date('2026-11-10T20:15:42.123Z')).toISOString(),
    ).toBe('2026-11-10T14:15:42.123Z');
  });

  it('handles midnight in San Salvador as hour 00', () => {
    expect(
      toElSalvadorWallClock(new Date('2026-11-11T06:00:00.000Z')).toISOString(),
    ).toBe('2026-11-11T00:00:00.000Z');
  });
});

describe('resolveOccurredAt', () => {
  const now = new Date('2026-11-11T03:30:00.000Z');

  it('uses now when occurredAt is missing', () => {
    expect(resolveOccurredAt(undefined, now)?.toISOString()).toBe(
      '2026-11-10T21:30:00.000Z',
    );
  });

  it('converts an ISO instant with offset', () => {
    expect(resolveOccurredAt('2026-11-10T21:30:00-06:00')?.toISOString()).toBe(
      '2026-11-10T21:30:00.000Z',
    );
    expect(resolveOccurredAt('2026-11-11T03:30:00Z')?.toISOString()).toBe(
      '2026-11-10T21:30:00.000Z',
    );
  });

  it('stores a local time without offset literally', () => {
    expect(resolveOccurredAt('2026-11-10T21:30:00')?.toISOString()).toBe(
      '2026-11-10T21:30:00.000Z',
    );
    expect(resolveOccurredAt('2026-11-10')?.toISOString()).toBe(
      '2026-11-10T00:00:00.000Z',
    );
  });

  it('returns null for garbage', () => {
    expect(resolveOccurredAt('ayer')).toBeNull();
  });
});
