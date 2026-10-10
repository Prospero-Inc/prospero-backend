const BACKFILL_WINDOW_DAYS = 30;
/** Gmail's `after:` operator has day granularity, so an incremental sync
 * always looks one extra day back and relies on the in-memory `internalDate`
 * filter (plus the `ProcessedEmail` idempotency check) to discard what it
 * already saw. */
const INCREMENTAL_LOOKBACK_DAYS = 1;

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

/** Formats a date as Gmail's `after:`/`before:` operators expect: `YYYY/MM/DD`. */
export function formatGmailDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

/**
 * Lower bound of the Gmail search window for a given connection.
 * - Backfill (never synced before): the last 30 days.
 * - Incremental: `lastSyncAt` minus one day, to cover `after:`'s day
 *   granularity — see `INCREMENTAL_LOOKBACK_DAYS` above.
 */
export function resolveSyncWindowStart(
  lastSyncAt: Date | null,
  now: Date,
): Date {
  if (!lastSyncAt) {
    return addUTCDays(now, -BACKFILL_WINDOW_DAYS);
  }
  return addUTCDays(lastSyncAt, -INCREMENTAL_LOOKBACK_DAYS);
}

/**
 * Builds the `q=` query for `users.messages.list`, filtering server-side by
 * sender and date — never fetching the whole mailbox (privacy requirement,
 * spec §11).
 */
export function buildGmailSearchQuery(
  senderEmails: string[],
  afterDate: Date,
): string {
  const fromClause = `from:(${senderEmails.join(' OR ')})`;
  return `${fromClause} after:${formatGmailDate(afterDate)}`;
}
