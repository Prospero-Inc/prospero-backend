import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
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
  let userService: {
    findOne: jest.Mock;
    findById: jest.Mock;
    updateSecretKey: jest.Mock;
    confirm2FA: jest.Mock;
    disable2FA: jest.Mock;
    findOneByEmail: jest.Mock;
    updateResetPasswordToken: jest.Mock;
    resetPasswordWithToken: jest.Mock;
    updateActivationToken: jest.Mock;
  };
  let mailService: {
    sendResetPassword: jest.Mock;
    sendVerificationUsers: jest.Mock;
  };
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
    userService = {
      findOne: jest.fn(),
      findById: jest.fn(),
      updateSecretKey: jest.fn(),
      confirm2FA: jest.fn(),
      disable2FA: jest.fn(),
      findOneByEmail: jest.fn(),
      updateResetPasswordToken: jest.fn(),
      resetPasswordWithToken: jest.fn(),
      updateActivationToken: jest.fn(),
    };
    mailService = {
      sendResetPassword: jest.fn(),
      sendVerificationUsers: jest.fn(),
    };
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
        { provide: MailService, useValue: mailService },
        {
          provide: RefreshTokenRepository,
          useValue: refreshTokenRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('requestResetPassword', () => {
    const uuidV4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    it('resolves silently and sends no mail for an unknown email', async () => {
      userService.findOneByEmail.mockResolvedValue(null);

      await expect(
        service.requestResetPassword({ email: 'nobody@example.com' }),
      ).resolves.toBeUndefined();

      expect(userService.updateResetPasswordToken).not.toHaveBeenCalled();
      expect(mailService.sendResetPassword).not.toHaveBeenCalled();
    });

    it('mails a uuid token but stores only its hash, valid for 60 minutes', async () => {
      userService.findOneByEmail.mockResolvedValue(activeUser);
      userService.updateResetPasswordToken.mockResolvedValue(activeUser);
      mailService.sendResetPassword.mockResolvedValue(undefined);
      const before = Date.now();

      await service.requestResetPassword({ email: activeUser.email });

      const [, mailedToken] = mailService.sendResetPassword.mock.calls[0];
      const [id, storedToken, expiresAt] =
        userService.updateResetPasswordToken.mock.calls[0];
      expect(mailedToken).toMatch(uuidV4);
      expect(id).toBe(activeUser.id);
      expect(storedToken).toBe(hash(mailedToken));
      expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(
        60 * 60 * 1000,
      );
      expect(expiresAt.getTime() - before).toBeLessThan(61 * 60 * 1000);
    });

    it('throws UnprocessableEntityException when the mailer fails', async () => {
      userService.findOneByEmail.mockResolvedValue(activeUser);
      userService.updateResetPasswordToken.mockResolvedValue(activeUser);
      mailService.sendResetPassword.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.requestResetPassword({ email: activeUser.email }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('resetPassword', () => {
    const token = '0b8a3f1e-6c2d-4f4a-9b1e-2d3c4b5a6f70';

    it('looks the link up by hash, sets the password and revokes sessions', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      userService.resetPasswordWithToken.mockResolvedValue({ userId: 1 });

      await service.resetPassword({
        resetPasswordToken: token,
        password: 'N3w-password',
      });

      expect(userService.resetPasswordWithToken).toHaveBeenCalledWith(
        hash(token),
        'new-hash',
        expect.any(Date),
      );
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    });

    it('rejects an unknown, expired or already used link', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      userService.resetPasswordWithToken.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          resetPasswordToken: token,
          password: 'N3w-password',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(refreshTokenRepository.revokeAllForUser).not.toHaveBeenCalled();
    });
  });

  describe('resendVerification', () => {
    const inactiveUser = { ...activeUser, isActive: false };

    it('returns a generic message and sends no mail for an unknown email', async () => {
      userService.findOneByEmail.mockResolvedValue(null);

      const result = await service.resendVerification({
        email: 'nobody@example.com',
      });

      expect(result).toEqual({ message: expect.any(String) });
      expect(userService.updateActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendVerificationUsers).not.toHaveBeenCalled();
    });

    it('returns a generic message and sends no mail for an already active user', async () => {
      userService.findOneByEmail.mockResolvedValue(activeUser);

      const result = await service.resendVerification({
        email: activeUser.email,
      });

      expect(result).toEqual({ message: expect.any(String) });
      expect(userService.updateActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendVerificationUsers).not.toHaveBeenCalled();
    });

    it('returns the same message for unknown, active and inactive users', async () => {
      userService.findOneByEmail.mockResolvedValueOnce(null);
      const unknown = await service.resendVerification({ email: 'a@b.com' });
      userService.findOneByEmail.mockResolvedValueOnce(activeUser);
      const active = await service.resendVerification({ email: 'a@b.com' });
      userService.findOneByEmail.mockResolvedValueOnce(inactiveUser);
      userService.updateActivationToken.mockResolvedValue(inactiveUser);
      const inactive = await service.resendVerification({ email: 'a@b.com' });

      expect(active).toEqual(unknown);
      expect(inactive).toEqual(unknown);
    });

    it('reuses the existing activation token so earlier links stay valid', async () => {
      const pending = { ...inactiveUser, activationToken: 'old-token' };
      userService.findOneByEmail.mockResolvedValue(pending);
      mailService.sendVerificationUsers.mockResolvedValue(undefined);

      await service.resendVerification({ email: inactiveUser.email });

      expect(userService.updateActivationToken).not.toHaveBeenCalled();
      expect(mailService.sendVerificationUsers).toHaveBeenCalledWith(pending);
    });

    it('issues a token only when the inactive user has none', async () => {
      const tokenless = { ...inactiveUser, activationToken: null };
      const updated = { ...inactiveUser, activationToken: 'new-token' };
      userService.findOneByEmail.mockResolvedValue(tokenless);
      userService.updateActivationToken.mockResolvedValue(updated);
      mailService.sendVerificationUsers.mockResolvedValue(undefined);

      await service.resendVerification({ email: inactiveUser.email });

      expect(userService.updateActivationToken).toHaveBeenCalledWith(
        inactiveUser.id,
        expect.any(String),
      );
      expect(mailService.sendVerificationUsers).toHaveBeenCalledWith(updated);
    });

    it('throws UnprocessableEntityException when the mailer fails', async () => {
      userService.findOneByEmail.mockResolvedValue(inactiveUser);
      userService.updateActivationToken.mockResolvedValue(inactiveUser);
      mailService.sendVerificationUsers.mockRejectedValue(new Error('smtp'));

      await expect(
        service.resendVerification({ email: inactiveUser.email }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
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
        typ: 'access',
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
        { email: twoFaUser.email, userId: twoFaUser.id, typ: 'pre_auth' },
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

    it('rejects a token whose typ is not pre_auth', async () => {
      jwtService.verify.mockReturnValue({
        email: twoFaUser.email,
        userId: twoFaUser.id,
        typ: 'access',
      });

      await expect(
        service.verifyLoginTwoFactor('full-token', '123456'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an incorrect OTP', async () => {
      jwtService.verify.mockReturnValue({
        email: twoFaUser.email,
        userId: twoFaUser.id,
        typ: 'pre_auth',
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
        typ: 'pre_auth',
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

  describe('2FA setup', () => {
    it('stores a pending secret without turning 2FA on', async () => {
      userService.findById.mockResolvedValue({
        ...activeUser,
        enable2FA: false,
      });
      (speakeasy.generateSecret as jest.Mock).mockReturnValue({
        base32: 'PENDINGSECRET',
        otpauth_url: 'otpauth://totp/x',
      });

      const result = await service.enable2FA(1);

      expect(userService.updateSecretKey).toHaveBeenCalledWith(
        1,
        'PENDINGSECRET',
        'otpauth://totp/x',
      );
      expect(userService.confirm2FA).not.toHaveBeenCalled();
      expect(result).toEqual({
        secret: 'PENDINGSECRET',
        qr: 'otpauth://totp/x',
      });
    });

    it('turns 2FA on only when the first code verifies', async () => {
      userService.findById.mockResolvedValue({
        ...activeUser,
        enable2FA: false,
        twoFASecret: 'PENDINGSECRET',
      });
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);

      await expect(service.validate2FAToken(1, '123456')).resolves.toEqual({
        verified: true,
      });
      expect(userService.confirm2FA).toHaveBeenCalledWith(1);
    });

    it('leaves 2FA off and reports verified: false on a wrong code', async () => {
      userService.findById.mockResolvedValue({
        ...activeUser,
        enable2FA: false,
        twoFASecret: 'PENDINGSECRET',
      });
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);

      await expect(service.validate2FAToken(1, '000000')).resolves.toEqual({
        verified: false,
      });
      expect(userService.confirm2FA).not.toHaveBeenCalled();
    });

    it('reports verified: false when there is no pending secret', async () => {
      userService.findById.mockResolvedValue({
        ...activeUser,
        enable2FA: false,
        twoFASecret: null,
      });

      await expect(service.validate2FAToken(1, '123456')).resolves.toEqual({
        verified: false,
      });
      expect(speakeasy.totp.verify).not.toHaveBeenCalledWith(
        expect.objectContaining({ token: '123456', secret: null }),
      );
    });

    it('refuses to hand out the secret again once 2FA is enabled', async () => {
      userService.findById.mockResolvedValue({
        ...activeUser,
        enable2FA: true,
        twoFASecret: 'ACTIVESECRET',
      });

      await expect(service.enable2FA(1)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(userService.updateSecretKey).not.toHaveBeenCalled();
    });
  });

  describe('disable2FA', () => {
    const twoFaUser = {
      ...activeUser,
      enable2FA: true,
      twoFASecret: 'ACTIVESECRET',
    };

    it('keeps 2FA on when the code is wrong', async () => {
      userService.findById.mockResolvedValue(twoFaUser);
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(false);

      await expect(service.disable2FA(1, '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(userService.disable2FA).not.toHaveBeenCalled();
    });

    it('turns 2FA off with a valid code', async () => {
      userService.findById.mockResolvedValue(twoFaUser);
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);

      await service.disable2FA(1, '123456');

      expect(speakeasy.totp.verify).toHaveBeenCalledWith(
        expect.objectContaining({ secret: 'ACTIVESECRET', token: '123456' }),
      );
      expect(userService.disable2FA).toHaveBeenCalledWith(1);
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
