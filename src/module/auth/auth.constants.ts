/** Access token TTL, passed to `JwtModule.register`'s `signOptions.expiresIn`. */
export const ACCESS_TOKEN_TTL = '15m';

/**
 * Same value as `ACCESS_TOKEN_TTL` expressed in seconds, sent explicitly in
 * `AccessTokenResponse.accessTokenExpiresIn` so clients never have to decode the JWT
 * to learn its own expiry.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Refresh token lifetime, in days, before it must be re-issued via `POST /auth/refresh`. */
export const REFRESH_TOKEN_TTL_DAYS = 30;

/** Login attempts allowed per email (on top of the per-IP limit) in each window. */
export const LOGIN_EMAIL_LIMIT = 5;

/** Window, and block length once exceeded, of the per-email login limit. */
export const LOGIN_EMAIL_WINDOW_MS = 15 * 60 * 1000;

/** Lifetime of a password-reset link. */
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;
