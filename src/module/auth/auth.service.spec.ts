import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as crypto from 'crypto';

import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';

jest.mock('bcrypt');
jest.mock('speakeasy');

describe('AuthService', () => {
  let service: AuthService;
  let userService: { findOne: jest.Mock; findById: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let refreshTokenRepository: {
    create: jest.Mock;
    findByTokenHash: jest.Mock;
    revoke: jest.Mock;
    revokeAllForUser: jest.Mock;
  };

  const activeUser = {
    id: 1,
    email: 'user@example.com',
    password: 'hashed-password',
    isActive: true,
    enable2FA: false,
    twoFASecret: null,
    firstName: 'John',
    lastName: 'Doe',
    username: 'johnd',
  };

  const hash = (raw: string) =>
    crypto.createHash('sha256').update(raw).digest('hex');

  beforeEach(async () => {
    userService = { findOne: jest.fn(), findById: jest.fn() };
    jwtService = { sign: jest.fn(), verify: jest.fn() };
    refreshTokenRepository = {
      create: jest.fn(),
      findByTokenHash: jest.fn(),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: {} },
        {
          provide: RefreshTokenRepository,
          useValue: refreshTokenRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('throws when the password does not match', async () => {
      userService.findOne.mockResolvedValue(activeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: activeUser.email, password: 'wrong' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns an access token and a refresh token directly when 2FA is disabled', async () => {
      userService.findOne.mockResolvedValue(activeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('real-access-token');
      refreshTokenRepository.create.mockResolvedValue({});

      const result = await service.login({
        email: activeUser.email,
        password: 'correct',
      });

      expect(result).toEqual({
        accessToken: 'real-access-token',
        accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken: expect.any(String),
        user: {
          id: activeUser.id,
          name: 'John Doe',
          email: activeUser.email,
          username: activeUser.username,
        },
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        email: activeUser.email,
        userId: activeUser.id,
      });
      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        activeUser.id,
        expect.any(String),
        expect.any(Date),
      );
    });

    it('returns a short-lived preAuthToken instead of a session when 2FA is enabled', async () => {
      const twoFaUser = {
        ...activeUser,
        enable2FA: true,
        twoFASecret: 'SECRET',
      };
      userService.findOne.mockResolvedValue(twoFaUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('pre-auth-token');

      const result = await service.login({
        email: twoFaUser.email,
        password: 'correct',
      });

      expect(result).toEqual({
        requires2FA: true,
        preAuthToken: 'pre-auth-token',
        message: '',
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        { email: twoFaUser.email, userId: twoFaUser.id, pending2FA: true },
        { expiresIn: '5m' },
      );
      expect(refreshTokenRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('verifyLoginTwoFactor', () => {
    const twoFaUser = {
      ...activeUser,
      enable2FA: true,
      twoFASecret: 'SECRET',
    };

    it('rejects a preAuthToken that fails verification', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      await expect(
        service.verifyLoginTwoFactor('bad-token', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a token that is not marked pending2FA', async () => {
      jwtService.verify.mockReturnValue({
        email: twoFaUser.email,
        userId: twoFaUser.id,
      });

      await expect(
        service.verifyLoginTwoFactor('full-token', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect OTP', async () => {
      jwtService.verify.mockReturnValue({
        email: twoFaUser.email,
        userId: twoFaUser.id,
        pending2FA: true,
      });
      userService.findById.mockResolvedValue(twoFaUser);
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);

      await expect(
        service.verifyLoginTwoFactor('pre-auth-token', '000000'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('returns the real access token and a refresh token when the OTP is correct', async () => {
      jwtService.verify.mockReturnValue({
        email: twoFaUser.email,
        userId: twoFaUser.id,
        pending2FA: true,
      });
      userService.findById.mockResolvedValue(twoFaUser);
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);
      jwtService.sign.mockReturnValue('real-access-token');
      refreshTokenRepository.create.mockResolvedValue({});

      const result = await service.verifyLoginTwoFactor(
        'pre-auth-token',
        '123456',
      );

      expect(result).toEqual({
        accessToken: 'real-access-token',
        accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken: expect.any(String),
        user: {
          id: twoFaUser.id,
          name: 'John Doe',
          email: twoFaUser.email,
          username: twoFaUser.username,
        },
      });
    });
  });

  describe('refreshToken', () => {
    it('throws 401 when the token is unknown', async () => {
      refreshTokenRepository.findByTokenHash.mockResolvedValue(null);

      await expect(
        service.refreshToken('unknown-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('revokes the whole family and throws 401 on reuse of an already-revoked token', async () => {
      const rawToken = 'stolen-token';
      refreshTokenRepository.findByTokenHash.mockResolvedValue({
        userId: activeUser.id,
        tokenHash: hash(rawToken),
        expiresAt: new Date(Date.now() + 1000 * 60),
        revokedAt: new Date(),
      });

      await expect(service.refreshToken(rawToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(
        activeUser.id,
      );
    });

    it('throws 401 when the token has expired', async () => {
      const rawToken = 'expired-token';
      refreshTokenRepository.findByTokenHash.mockResolvedValue({
        userId: activeUser.id,
        tokenHash: hash(rawToken),
        expiresAt: new Date(Date.now() - 1000 * 60),
        revokedAt: null,
      });

      await expect(service.refreshToken(rawToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rotates a valid token into a brand new access/refresh pair', async () => {
      const rawToken = 'valid-token';
      refreshTokenRepository.findByTokenHash.mockResolvedValue({
        userId: activeUser.id,
        tokenHash: hash(rawToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        revokedAt: null,
      });
      userService.findById.mockResolvedValue(activeUser);
      jwtService.sign.mockReturnValue('new-access-token');
      refreshTokenRepository.create.mockResolvedValue({});
      refreshTokenRepository.revoke.mockResolvedValue({});

      const result = await service.refreshToken(rawToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).not.toBe(rawToken);
      expect(refreshTokenRepository.revoke).toHaveBeenCalledWith(
        hash(rawToken),
        hash(result.refreshToken),
      );
    });
  });

  describe('logout', () => {
    it('revokes the presented refresh token', async () => {
      const rawToken = 'active-token';
      refreshTokenRepository.findByTokenHash.mockResolvedValue({
        userId: activeUser.id,
        tokenHash: hash(rawToken),
        revokedAt: null,
      });
      refreshTokenRepository.revoke.mockResolvedValue({});

      await service.logout(rawToken);

      expect(refreshTokenRepository.revoke).toHaveBeenCalledWith(
        hash(rawToken),
      );
    });

    it('is idempotent when the token is unknown', async () => {
      refreshTokenRepository.findByTokenHash.mockResolvedValue(null);

      await expect(service.logout('unknown-token')).resolves.toBeUndefined();
      expect(refreshTokenRepository.revoke).not.toHaveBeenCalled();
    });

    it('is idempotent when the token is already revoked', async () => {
      const rawToken = 'already-revoked-token';
      refreshTokenRepository.findByTokenHash.mockResolvedValue({
        userId: activeUser.id,
        tokenHash: hash(rawToken),
        revokedAt: new Date(),
      });

      await expect(service.logout(rawToken)).resolves.toBeUndefined();
      expect(refreshTokenRepository.revoke).not.toHaveBeenCalled();
    });
  });
});
