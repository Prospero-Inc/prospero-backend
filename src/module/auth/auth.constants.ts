export const authConstants = {
  secret: 'NAT_12X#@',
};

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
