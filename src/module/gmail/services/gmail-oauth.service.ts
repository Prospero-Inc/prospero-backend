import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import { GmailConnectionStatus } from '@prisma/client';
import { GmailConnectionRepository } from '../repositories/gmail-connection.repository';
import { UpdateGmailPreferencesDto } from '../dto';
import {
  GMAIL_AUTHORIZE_URL,
  GMAIL_READONLY_SCOPE,
  GMAIL_REVOKE_URL,
  GMAIL_TOKEN_URL,
  OAUTH_STATE_PURPOSE,
  OAUTH_STATE_TTL,
  TOKEN_REFRESH_SKEW_SECONDS,
} from '../gmail.constants';
import {
  GmailConnectionRevokedError,
  GmailConnectionStatusResponse,
  GmailConnectionWriteData,
  GmailOAuthCallbackError,
  GmailOAuthOutcome,
  GoogleTokenResponse,
  OAuthStatePayload,
} from '../types';
import { encryptToken, decryptToken } from '../utils/token-encryption.util';

const FORM_URL_ENCODED_HEADERS = {
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
};

@Injectable()
export class GmailOAuthService {
  private readonly logger = new Logger(GmailOAuthService.name);

  constructor(
    private readonly connectionRepository: GmailConnectionRepository,
    private readonly httpService: HttpService,
    private readonly jwtService: JwtService,
  ) {}

  /** Builds the Google consent screen URL, embedding a signed `state` with the userId. */
  buildAuthorizeUrl(userId: number): string {
    const state = this.signOAuthState(userId);
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID,
      redirect_uri: process.env.GMAIL_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: GMAIL_READONLY_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `${GMAIL_AUTHORIZE_URL}?${params.toString()}`;
  }

  /** Builds the URL the browser is redirected to once the callback is done, with the outcome. */
  buildRedirectUrl(outcome: GmailOAuthOutcome): string {
    const url = new URL(process.env.GMAIL_OAUTH_SUCCESS_REDIRECT_URL);

    if (outcome === 'connected') {
      url.searchParams.set('gmail', 'connected');
    } else {
      url.searchParams.set('gmail', 'error');
      url.searchParams.set('reason', outcome);
    }

    return url.toString();
  }

  /**
   * Verifies `state`, exchanges `code` for tokens, encrypts and persists them.
   * Throws `GmailOAuthCallbackError` with a short, stable `reason` on any
   * failure — never lets a raw axios/Google error escape.
   */
  async handleOAuthCallback(code: string, state: string): Promise<void> {
    const userId = this.verifyOAuthState(state);
    const tokenResponse = await this.exchangeCodeForTokens(code);
    const existing = await this.connectionRepository.findByUserId(userId);

    if (!tokenResponse.refresh_token && !existing) {
      this.logger.warn(
        `Gmail OAuth: Google did not return a refresh_token on first connection for userId=${userId}`,
      );
      throw new GmailOAuthCallbackError(
        'no_refresh_token',
        'Google did not return a refresh token on first connection',
      );
    }

    const tokenExpiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    );
    const encryptedAccessToken = encryptToken(tokenResponse.access_token);

    if (existing) {
      const updateData: Partial<GmailConnectionWriteData> = {
        encryptedAccessToken,
        tokenExpiresAt,
        grantedScope: tokenResponse.scope,
        status: GmailConnectionStatus.Connected,
      };

      // Google doesn't always reissue a refresh_token on reconnection — never
      // overwrite a valid stored one with an absent value.
      if (tokenResponse.refresh_token) {
        updateData.encryptedRefreshToken = encryptToken(
          tokenResponse.refresh_token,
        );
      }

      await this.connectionRepository.update(userId, updateData);
      return;
    }

    await this.connectionRepository.create(userId, {
      encryptedAccessToken,
      encryptedRefreshToken: encryptToken(tokenResponse.refresh_token),
      tokenExpiresAt,
      grantedScope: tokenResponse.scope,
      status: GmailConnectionStatus.Connected,
    });
  }

  /** Revokes the connection at Google and deletes the local row. Idempotent. */
  async disconnect(userId: number): Promise<void> {
    const connection = await this.connectionRepository.findByUserId(userId);
    if (!connection) {
      return;
    }

    try {
      await this.revokeTokenAtGoogle(
        decryptToken(connection.encryptedRefreshToken),
      );
    } catch {
      // If we couldn't confirm the revocation with Google, don't delete the
      // local row — otherwise the token stays live at Google while we've
      // silently lost track of it locally (a quiet leak).
      throw new ServiceUnavailableException(
        'Could not confirm the Gmail disconnection with Google, please try again',
      );
    }

    await this.connectionRepository.delete(userId);
  }

  /** Status/preferences only — never the encrypted tokens. */
  async getConnectionStatus(
    userId: number,
  ): Promise<GmailConnectionStatusResponse> {
    const connection = await this.connectionRepository.findByUserId(userId);

    if (!connection) {
      return {
        connected: false,
        status: GmailConnectionStatus.Disconnected,
        lastSyncAt: null,
        autoDetectEnabled: true,
        notifyIncomeEnabled: true,
      };
    }

    return {
      connected: connection.status === GmailConnectionStatus.Connected,
      status: connection.status,
      lastSyncAt: connection.lastSyncAt,
      autoDetectEnabled: connection.autoDetectEnabled,
      notifyIncomeEnabled: connection.notifyIncomeEnabled,
    };
  }

  /** Raw connection for a manual "sync now" trigger. Throws if there's
   * nothing to sync (never connected, or disconnected) — the caller turns
   * that into a clear 404 rather than silently doing nothing. */
  async getActiveConnectionForUser(userId: number) {
    const connection = await this.connectionRepository.findByUserId(userId);

    if (!connection || connection.status !== GmailConnectionStatus.Connected) {
      throw new NotFoundException(
        'No hay una cuenta de Gmail conectada para este usuario',
      );
    }

    return connection;
  }

  async updatePreferences(
    userId: number,
    dto: UpdateGmailPreferencesDto,
  ): Promise<GmailConnectionStatusResponse> {
    const connection = await this.connectionRepository.findByUserId(userId);
    if (!connection) {
      throw new NotFoundException('Gmail connection not found');
    }

    const data: Partial<GmailConnectionWriteData> = {};
    if (dto.autoDetectEnabled !== undefined) {
      data.autoDetectEnabled = dto.autoDetectEnabled;
    }
    if (dto.notifyIncomeEnabled !== undefined) {
      data.notifyIncomeEnabled = dto.notifyIncomeEnabled;
    }

    await this.connectionRepository.update(userId, data);

    return this.getConnectionStatus(userId);
  }

  /**
   * Internal use only (not exposed by any route yet — Phase 3's sync worker
   * will call this). Returns a valid access token, lazily refreshing it if
   * it's expired or about to expire within `TOKEN_REFRESH_SKEW_SECONDS`.
   * Throws `GmailConnectionRevokedError` if Google confirms `invalid_grant`.
   */
  async getValidAccessToken(userId: number): Promise<string> {
    const connection = await this.connectionRepository.findByUserId(userId);
    if (!connection) {
      throw new GmailConnectionRevokedError(
        'No Gmail connection found for this user',
      );
    }

    const skewMs = TOKEN_REFRESH_SKEW_SECONDS * 1000;
    const isExpiringSoon =
      !connection.tokenExpiresAt ||
      connection.tokenExpiresAt.getTime() - skewMs <= Date.now();

    if (!isExpiringSoon) {
      return decryptToken(connection.encryptedAccessToken);
    }

    let tokenResponse: GoogleTokenResponse;
    try {
      tokenResponse = await this.refreshAccessToken(
        connection.encryptedRefreshToken,
      );
    } catch (err) {
      if (this.isInvalidGrantError(err)) {
        await this.connectionRepository.updateStatus(
          userId,
          GmailConnectionStatus.Revoked,
        );
        throw new GmailConnectionRevokedError(
          'Gmail connection was revoked, the user needs to reconnect',
        );
      }

      // Transient failure (5xx/timeout) — don't degrade a healthy connection.
      throw new Error('Gmail is temporarily unavailable, please retry later');
    }

    const tokenExpiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    );
    const encryptedAccessToken = encryptToken(tokenResponse.access_token);

    await this.connectionRepository.update(userId, {
      encryptedAccessToken,
      tokenExpiresAt,
    });

    return decryptToken(encryptedAccessToken);
  }

  /**
   * Candidates for `GmailSyncScheduler`'s hourly cron — connections that are
   * `Connected` and have auto-detection enabled. Kept on this service (not a
   * raw repository export) so GmailModule's only public surface stays
   * `GmailOAuthService`, same as everywhere else in the app.
   */
  listConnectionsForAutoSync() {
    return this.connectionRepository.findConnectedWithAutoDetect();
  }

  /** Called by GmailSyncOrchestrator once a user's sync pass finishes
   * (successfully or not — see the scheduler's per-user try/catch), so the
   * next run knows where the incremental window should start from. */
  markSynced(userId: number, syncedAt: Date): Promise<void> {
    return this.connectionRepository
      .update(userId, { lastSyncAt: syncedAt })
      .then(() => undefined);
  }

  private signOAuthState(userId: number): string {
    const payload: OAuthStatePayload = {
      userId,
      purpose: OAUTH_STATE_PURPOSE,
    };

    return this.jwtService.sign(payload, { expiresIn: OAUTH_STATE_TTL });
  }

  /** Verifies `state`'s signature + discriminant claim, returns the embedded userId or throws. */
  private verifyOAuthState(state: string): number {
    let payload: OAuthStatePayload;
    try {
      payload = this.jwtService.verify<OAuthStatePayload>(state);
    } catch {
      throw new GmailOAuthCallbackError(
        'invalid_state',
        'Invalid or expired OAuth state',
      );
    }

    if (payload.purpose !== OAUTH_STATE_PURPOSE) {
      throw new GmailOAuthCallbackError(
        'invalid_state',
        'OAuth state has an unexpected purpose claim',
      );
    }

    return payload.userId;
  }

  private async exchangeCodeForTokens(
    code: string,
  ): Promise<GoogleTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID,
      client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
      redirect_uri: process.env.GMAIL_OAUTH_REDIRECT_URI,
    }).toString();

    try {
      const response = await firstValueFrom(
        this.httpService.post<GoogleTokenResponse>(
          GMAIL_TOKEN_URL,
          body,
          FORM_URL_ENCODED_HEADERS,
        ),
      );
      return response.data;
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        // Google responded with an error status (code already used,
        // redirect_uri mismatch, bad client secret, etc.).
        throw new GmailOAuthCallbackError(
          'exchange_failed',
          'Gmail token exchange failed',
        );
      }

      // No response at all — Google unreachable or timed out.
      throw new GmailOAuthCallbackError(
        'google_unavailable',
        'Gmail is temporarily unavailable',
      );
    }
  }

  private async refreshAccessToken(
    encryptedRefreshToken: string,
  ): Promise<GoogleTokenResponse> {
    const refreshToken = decryptToken(encryptedRefreshToken);
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_OAUTH_CLIENT_ID,
      client_secret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
    }).toString();

    const response = await firstValueFrom(
      this.httpService.post<GoogleTokenResponse>(
        GMAIL_TOKEN_URL,
        body,
        FORM_URL_ENCODED_HEADERS,
      ),
    );
    return response.data;
  }

  private async revokeTokenAtGoogle(rawToken: string): Promise<void> {
    const body = new URLSearchParams({ token: rawToken }).toString();

    try {
      await firstValueFrom(
        this.httpService.post(GMAIL_REVOKE_URL, body, FORM_URL_ENCODED_HEADERS),
      );
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400) {
        // Already invalid at Google's end — the goal (no longer active) is
        // already met, treat as idempotent success.
        return;
      }
      throw err;
    }
  }

  private isInvalidGrantError(err: unknown): boolean {
    return (
      isAxiosError(err) &&
      err.response?.status === 400 &&
      (err.response?.data as { error?: string } | undefined)?.error ===
        'invalid_grant'
    );
  }
}
