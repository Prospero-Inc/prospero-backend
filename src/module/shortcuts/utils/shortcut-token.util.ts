import { createHash, randomBytes } from 'crypto';
import { SHORTCUT_TOKEN_PREFIX } from '../shortcuts.constants';

/** `prs_` + base64url of 32 random bytes (256 bits). */
export function generateShortcutToken(): string {
  return `${SHORTCUT_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

/** SHA-256 (hex) of the full raw token, prefix included — the only form
 * ever stored. */
export function hashShortcutToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** The `prs_...` value of an `Authorization: Bearer prs_...` header, or
 * `null` (missing header, other scheme, or not a Shortcuts token — e.g. a
 * normal JWT). */
export function extractShortcutBearer(
  authorization: string | string[] | undefined,
): string | null {
  if (typeof authorization !== 'string') return null;
  const match = authorization.match(/^Bearer\s+(\S+)\s*$/i);
  if (!match) return null;
  const token = match[1];
  return token.startsWith(SHORTCUT_TOKEN_PREFIX) &&
    token.length > SHORTCUT_TOKEN_PREFIX.length
    ? token
    : null;
}
