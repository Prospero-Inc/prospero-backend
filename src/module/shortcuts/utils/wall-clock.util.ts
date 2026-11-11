import { SHORTCUT_TIME_ZONE } from '../shortcuts.constants';

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SHORTCUT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** An ISO string that names its own offset ("Z", "+02:00", "-0600"). */
const HAS_OFFSET_REGEX = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The El Salvador wall-clock time of `instant`, written into the UTC fields
 * ("UTC literal"), the same convention the Gmail parsers use: a purchase made
 * 2026-11-10 21:30 in San Salvador is stored as 2026-11-10T21:30:00Z, so its
 * UTC calendar day is the day the user saw. Uses Intl, so the result doesn't
 * depend on the server's TZ.
 */
export function toElSalvadorWallClock(instant: Date): Date {
  const parts = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', number>;

  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      instant.getUTCMilliseconds(),
    ),
  );
}

/**
 * Resolves the `occurredAt` Shortcuts sent (or now) to a UTC-literal El
 * Salvador date. An ISO string with an offset is a real instant and gets
 * converted; one without an offset ("2026-11-10T21:30", "2026-11-10") is
 * already a local wall-clock time and is stored literally. Returns `null`
 * for an unparseable string.
 */
export function resolveOccurredAt(
  occurredAt: string | undefined,
  now: Date = new Date(),
): Date | null {
  if (!occurredAt) return toElSalvadorWallClock(now);

  const value = occurredAt.trim();
  if (HAS_OFFSET_REGEX.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime())
      ? null
      : toElSalvadorWallClock(instant);
  }

  const literal = new Date(
    DATE_ONLY_REGEX.test(value) ? `${value}T00:00:00Z` : `${value}Z`,
  );
  return Number.isNaN(literal.getTime()) ? null : literal;
}
