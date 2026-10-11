import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { GmailConnectionStatus } from '@prisma/client';
import { GmailOAuthService } from './gmail-oauth.service';
import { GmailConnectionRepository } from '../repositories/gmail-connection.repository';
import { GmailConnectionRevokedError } from '../types';
import { decryptToken, encryptToken } from '../utils/token-encryption.util';

const ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function makeAxiosError(status: number, data: unknown): AxiosError {
  const error = new AxiosError('Request failed');
  error.response = {
    status,
    data,
    statusText: '',
    headers: {},
    config: {} as never,
  };
  return error;
}

describe('GmailOAuthService', () => {
  let service: GmailOAuthService;
  let repository: {
    findByUserId: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateStatus: jest.Mock;
    delete: jest.Mock;
  };
  let httpService: { post: jest.Mock };
  let jwtService: JwtService;

  const ENV_BACKUP = { ...process.env };

  beforeEach(async () => {
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = ENCRYPTION_KEY;
    process.env.GMAIL_OAUTH_CLIENT_ID = 'client-id';
    process.env.GMAIL_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.GMAIL_OAUTH_REDIRECT_URI =
      'http://localhost:3000/gmail/oauth/callback';
    process.env.GMAIL_OAUTH_SUCCESS_REDIRECT_URL =
      'http://localhost:4000/settings';

    repository = {
      findByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      delete: jest.fn(),
    };
    httpService = { post: jest.fn() };
    jwtService = new JwtService({ secret: 'test-secret' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailOAuthService,
        { provide: GmailConnectionRepository, useValue: repository },
        { provide: HttpService, useValue: httpService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<GmailOAuthService>(GmailOAuthService);
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildAuthorizeUrl', () => {
    it('includes client_id, redirect_uri, scope, access_type=offline, prompt=consent and a state carrying the userId', () => {
      const url = service.buildAuthorizeUrl(42);
      const parsed = new URL(url);

      expect(parsed.origin + parsed.pathname).toBe(
        'https://accounts.google.com/o/oauth2/v2/auth',
      );
      expect(parsed.searchParams.get('client_id')).toBe('client-id');
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3000/gmail/oauth/callback',
      );
      expect(parsed.searchParams.get('scope')).toBe(SCOPE);
      expect(parsed.searchParams.get('access_type')).toBe('offline');
      expect(parsed.searchParams.get('prompt')).toBe('consent');

      const state = parsed.searchParams.get('state');
      const decoded = jwtService.decode(state) as { userId: number };
      expect(decoded.userId).toBe(42);
    });
  });

  describe('handleOAuthCallback', () => {
    const signState = (userId: number, expiresIn: string | number = '5m') =>
      jwtService.sign({ userId, purpose: 'gmailOauthState' }, { expiresIn });

    it('first connection, with refresh_token: creates the row with correctly encrypted tokens', async () => {
      repository.findByUserId.mockResolvedValue(null);
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'access-123',
            refresh_token: 'refresh-123',
            expires_in: 3599,
            scope: SCOPE,
            token_type: 'Bearer',
          },
        }),
      );

      await service.handleOAuthCallback('auth-code', signState(7));

      expect(repository.create).toHaveBeenCalledTimes(1);
      const [userId, data] = repository.create.mock.calls[0];
      expect(userId).toBe(7);
      expect(decryptToken(data.encryptedAccessToken)).toBe('access-123');
      expect(decryptToken(data.encryptedRefreshToken)).toBe('refresh-123');
      expect(data.status).toBe(GmailConnectionStatus.Connected);
      expect(data.grantedScope).toBe(SCOPE);
    });

    it('reconnection without refresh_token: updates without the encryptedRefreshToken key, keeping the old one', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedRefreshToken: 'old-encrypted-refresh-token',
      });
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'new-access-token',
            expires_in: 3599,
            scope: SCOPE,
            token_type: 'Bearer',
          },
        }),
      );

      await service.handleOAuthCallback('auth-code', signState(7));

      expect(repository.update).toHaveBeenCalledTimes(1);
      const [userId, data] = repository.update.mock.calls[0];
      expect(userId).toBe(7);
      expect(data).not.toHaveProperty('encryptedRefreshToken');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('first connection without refresh_token: throws no_refresh_token and never creates a row', async () => {
      repository.findByUserId.mockResolvedValue(null);
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'access-123',
            expires_in: 3599,
            scope: SCOPE,
            token_type: 'Bearer',
          },
        }),
      );

      await expect(
        service.handleOAuthCallback('auth-code', signState(7)),
      ).rejects.toMatchObject({ reason: 'no_refresh_token' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('state signed with a different secret: throws invalid_state', async () => {
      const otherJwtService = new JwtService({ secret: 'another-secret' });
      const foreignState = otherJwtService.sign({
        userId: 7,
        purpose: 'gmailOauthState',
      });

      await expect(
        service.handleOAuthCallback('auth-code', foreignState),
      ).rejects.toMatchObject({ reason: 'invalid_state' });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('state with the wrong purpose claim: throws invalid_state', async () => {
      const state = jwtService.sign({ userId: 7, purpose: 'somethingElse' });

      await expect(
        service.handleOAuthCallback('auth-code', state),
      ).rejects.toMatchObject({ reason: 'invalid_state' });
    });

    it('expired state: throws invalid_state', async () => {
      const state = signState(7, '-1s');

      await expect(
        service.handleOAuthCallback('auth-code', state),
      ).rejects.toMatchObject({ reason: 'invalid_state' });
    });

    it('token exchange responds 400: throws exchange_failed', async () => {
      httpService.post.mockReturnValue(
        throwError(() => makeAxiosError(400, { error: 'invalid_grant' })),
      );

      await expect(
        service.handleOAuthCallback('auth-code', signState(7)),
      ).rejects.toMatchObject({ reason: 'exchange_failed' });
    });

    it('token exchange network failure (no response): throws google_unavailable', async () => {
      const networkError = new AxiosError('timeout');
      httpService.post.mockReturnValue(throwError(() => networkError));

      await expect(
        service.handleOAuthCallback('auth-code', signState(7)),
      ).rejects.toMatchObject({ reason: 'google_unavailable' });
    });
  });

  describe('disconnect', () => {
    it('no-ops without throwing when there is no previous connection', async () => {
      repository.findByUserId.mockResolvedValue(null);

      await service.disconnect(7);

      expect(httpService.post).not.toHaveBeenCalled();
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('with a previous connection, revoke succeeds (200): deletes the row', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedRefreshToken: encryptToken('refresh-raw'),
      });
      httpService.post.mockReturnValue(of({ data: {} }));

      await service.disconnect(7);

      expect(httpService.post).toHaveBeenCalledTimes(1);
      expect(repository.delete).toHaveBeenCalledWith(7);
    });

    it('revoke responds 400 (already invalid at Google): still treated as success, deletes the row', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedRefreshToken: encryptToken('refresh-raw'),
      });
      httpService.post.mockReturnValue(
        throwError(() => makeAxiosError(400, { error: 'invalid_token' })),
      );

      await service.disconnect(7);

      expect(repository.delete).toHaveBeenCalledWith(7);
    });

    it('revoke responds 503: does not delete the row, propagates as ServiceUnavailableException', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedRefreshToken: encryptToken('refresh-raw'),
      });
      httpService.post.mockReturnValue(
        throwError(() => makeAxiosError(503, {})),
      );

      await expect(service.disconnect(7)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });

  describe('getConnectionStatus', () => {
    it('maps the public fields and never leaks the encrypted tokens', async () => {
      repository.findByUserId.mockResolvedValue({
        status: GmailConnectionStatus.Connected,
        lastSyncAt: null,
        autoDetectEnabled: true,
        notifyIncomeEnabled: false,
        encryptedAccessToken: 'secret-access',
        encryptedRefreshToken: 'secret-refresh',
      });

      const result = await service.getConnectionStatus(7);

      expect(result).toEqual({
        connected: true,
        status: GmailConnectionStatus.Connected,
        lastSyncAt: null,
        autoDetectEnabled: true,
        notifyIncomeEnabled: false,
      });
      expect(result).not.toHaveProperty('encryptedAccessToken');
      expect(result).not.toHaveProperty('encryptedRefreshToken');
    });

    it('returns a disconnected status when there is no connection row', async () => {
      repository.findByUserId.mockResolvedValue(null);

      const result = await service.getConnectionStatus(7);

      expect(result.connected).toBe(false);
      expect(result.status).toBe(GmailConnectionStatus.Disconnected);
    });
  });

  describe('updatePreferences', () => {
    it('throws NotFoundException when there is no connection', async () => {
      repository.findByUserId.mockResolvedValue(null);

      await expect(
        service.updatePreferences(7, { autoDetectEnabled: false }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('passes only the fields present on the dto to the repository', async () => {
      repository.findByUserId
        .mockResolvedValueOnce({
          status: GmailConnectionStatus.Connected,
          lastSyncAt: null,
          autoDetectEnabled: true,
          notifyIncomeEnabled: true,
        })
        .mockResolvedValueOnce({
          status: GmailConnectionStatus.Connected,
          lastSyncAt: null,
          autoDetectEnabled: false,
          notifyIncomeEnabled: true,
        });

      await service.updatePreferences(7, { autoDetectEnabled: false });

      expect(repository.update).toHaveBeenCalledWith(7, {
        autoDetectEnabled: false,
      });
    });
  });

  describe('getValidAccessToken', () => {
    it('returns the decrypted access token directly when still valid beyond the skew', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedAccessToken: encryptToken('still-valid-access-token'),
        encryptedRefreshToken: encryptToken('refresh-raw'),
        tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const token = await service.getValidAccessToken(7);

      expect(token).toBe('still-valid-access-token');
      expect(httpService.post).not.toHaveBeenCalled();
    });

    it('refreshes when expired, persists and returns the new access token', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedAccessToken: encryptToken('old-access-token'),
        encryptedRefreshToken: encryptToken('refresh-raw'),
        tokenExpiresAt: new Date(Date.now() - 60 * 1000),
      });
      httpService.post.mockReturnValue(
        of({
          data: {
            access_token: 'brand-new-access-token',
            expires_in: 3599,
            scope: SCOPE,
            token_type: 'Bearer',
          },
        }),
      );

      const token = await service.getValidAccessToken(7);

      expect(token).toBe('brand-new-access-token');
      expect(repository.update).toHaveBeenCalledTimes(1);
      const [userId, data] = repository.update.mock.calls[0];
      expect(userId).toBe(7);
      expect(decryptToken(data.encryptedAccessToken)).toBe(
        'brand-new-access-token',
      );
    });

    it('invalid_grant on refresh: marks status Revoked and throws GmailConnectionRevokedError', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedAccessToken: encryptToken('old-access-token'),
        encryptedRefreshToken: encryptToken('refresh-raw'),
        tokenExpiresAt: new Date(Date.now() - 60 * 1000),
      });
      httpService.post.mockReturnValue(
        throwError(() => makeAxiosError(400, { error: 'invalid_grant' })),
      );

      await expect(service.getValidAccessToken(7)).rejects.toBeInstanceOf(
        GmailConnectionRevokedError,
      );
      expect(repository.updateStatus).toHaveBeenCalledWith(
        7,
        GmailConnectionStatus.Revoked,
      );
    });

    it('5xx/timeout on refresh: does not touch status, rethrows a generic transient error', async () => {
      repository.findByUserId.mockResolvedValue({
        encryptedAccessToken: encryptToken('old-access-token'),
        encryptedRefreshToken: encryptToken('refresh-raw'),
        tokenExpiresAt: new Date(Date.now() - 60 * 1000),
      });
      httpService.post.mockReturnValue(
        throwError(() => makeAxiosError(503, {})),
      );

      await expect(service.getValidAccessToken(7)).rejects.toThrow();
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });
  });
});
