import { GmailConnectionStatus } from '@prisma/client';
import { OAUTH_STATE_PURPOSE } from './gmail.constants';

/** Shape of Google's token endpoint response (both authorization_code and refresh_token grants). */
export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

/** Payload embedded in the signed `state` query param round-tripped through Google. */
export interface OAuthStatePayload {
  userId: number;
  purpose: typeof OAUTH_STATE_PURPOSE;
}

/**
 * Short, stable outcome codes surfaced to the frontend via
 * `GMAIL_OAUTH_SUCCESS_REDIRECT_URL`'s query params (`?gmail=connected` or
 * `?gmail=error&reason=<outcome>`).
 */
export type GmailOAuthOutcome =
  | 'connected'
  | 'cancelled'
  | 'invalid_state'
  | 'exchange_failed'
  | 'no_refresh_token'
  | 'google_unavailable'
  | 'invalid_request'
  | 'unknown_error';

/** Public connection status/preferences — never includes the encrypted tokens. */
export interface GmailConnectionStatusResponse {
  connected: boolean;
  status: GmailConnectionStatus;
  lastSyncAt: Date | null;
  autoDetectEnabled: boolean;
  notifyIncomeEnabled: boolean;
}

/** Fields `GmailConnectionRepository.create`/`.update` accept, all optional at the type level
 * (the service is responsible for always passing the full set on `create`, since the
 * underlying Prisma columns are non-nullable there). */
export interface GmailConnectionWriteData {
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  tokenExpiresAt?: Date | null;
  grantedScope?: string | null;
  status?: GmailConnectionStatus;
  autoDetectEnabled?: boolean;
  notifyIncomeEnabled?: boolean;
  lastSyncAt?: Date | null;
}

/**
 * Raised by `GmailOAuthService.handleOAuthCallback` on any failure mode —
 * always caught by the controller and mapped to a redirect, never left to
 * propagate into Nest's default JSON error response.
 */
export class GmailOAuthCallbackError extends Error {
  constructor(
    public readonly reason: GmailOAuthOutcome,
    message: string,
  ) {
    super(message);
    this.name = 'GmailOAuthCallbackError';
  }
}

/**
 * Raised by `GmailOAuthService.getValidAccessToken` when Google confirms the
 * refresh token is no longer valid (`invalid_grant`). Deliberately not a Nest
 * `UnauthorizedException`: this method isn't called from an HTTP request/guard
 * (Phase 3's sync worker will call it), so Nest's HTTP exception semantics
 * don't apply — the caller decides what "revoked" means for it.
 */
export class GmailConnectionRevokedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailConnectionRevokedError';
  }
}
