/**
 * Fixed Google OAuth 2.0 / Gmail API endpoints. Centralized here instead of
 * repeated as magic strings across the service, mirroring how auth.constants.ts
 * centralizes auth's TTLs.
 */
export const GMAIL_AUTHORIZE_URL =
  'https://accounts.google.com/o/oauth2/v2/auth';
export const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GMAIL_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Read-only Gmail scope requested on the consent screen. */
export const GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly';

/** TTL of the signed `state` JWT passed through the OAuth redirect dance. */
export const OAUTH_STATE_TTL = '5m';

/** Discriminant claim on the `state` JWT payload, see types.ts's `OAuthStatePayload`. */
export const OAUTH_STATE_PURPOSE = 'gmailOauthState' as const;

/**
 * How far ahead of the real expiry `getValidAccessToken` proactively refreshes,
 * so a token that is technically still valid but about to expire mid-request
 * never gets handed to a caller.
 */
export const TOKEN_REFRESH_SKEW_SECONDS = 120;
