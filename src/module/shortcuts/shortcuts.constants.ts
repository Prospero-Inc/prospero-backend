/** Every raw token starts with this, so a leaked one is recognizable (and
 * greppable by secret scanners). */
export const SHORTCUT_TOKEN_PREFIX = 'prs_';

/** The only scope today: creating transactions from iPhone Shortcuts. */
export const SHORTCUT_TRANSACTIONS_SCOPE = 'shortcut:transactions';

/** Per-token rate limit on POST /shortcuts/transactions. One Apple Pay
 * purchase fires one request; 30/min only stops a looping automation. */
export const SHORTCUT_RATE_LIMIT = 30;
export const SHORTCUT_RATE_TTL_MS = 60_000;
export const SHORTCUT_THROTTLER_NAME = 'shortcut-token';

/** Same automation firing twice for one purchase (Shortcuts retries,
 * double tap) lands well inside this window. */
export const DOUBLE_FIRE_WINDOW_MS = 2 * 60 * 1000;

/** Users are in El Salvador (UTC-6, no DST); dates are stored as that wall
 * clock written into the UTC fields, like the Gmail parsers do. */
export const SHORTCUT_TIME_ZONE = 'America/El_Salvador';

/** How many recent classified rows the suggestedCategory heuristic scans. */
export const SUGGESTION_SAMPLE_SIZE = 500;

/** Messages are Spanish-only: User has no language field and Shortcuts
 * sends no useful Accept-Language. */
export const SHORTCUT_LOCALE = 'es';

export const SHORTCUT_TOKEN_NAME_MAX_LENGTH = 60;
export const SHORTCUT_MERCHANT_MAX_LENGTH = 200;
