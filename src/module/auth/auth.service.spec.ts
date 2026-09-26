import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';

import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { MailService } from '../mail/mail.service';
import { JwtService } from '@nestjs/jwt';

jest.mock('bcrypt');
jest.mock('speakeasy');

describe('AuthService', () => {
  let service: AuthService;
  let userService: { findOne: jest.Mock; findById: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };

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

  beforeEach(async () => {
    userService = { findOne: jest.fn(), findById: jest.fn() };
    jwtService = { sign: jest.fn(), verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
        { provide: MailService, useValue: {} },
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

    it('returns an access token directly when 2FA is disabled', async () => {
      userService.findOne.mockResolvedValue(activeUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('real-access-token');

      const result = await service.login({
        email: activeUser.email,
        password: 'correct',
      });

      expect(result).toEqual({
        accessToken: 'real-access-token',
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

    it('returns the real access token when the OTP is correct', async () => {
      jwtService.verify.mockReturnValue({
        email: twoFaUser.email,
        userId: twoFaUser.id,
        pending2FA: true,
      });
      userService.findById.mockResolvedValue(twoFaUser);
      (speakeasy.totp.verify as jest.Mock).mockReturnValue(true);
      jwtService.sign.mockReturnValue('real-access-token');

      const result = await service.verifyLoginTwoFactor(
        'pre-auth-token',
        '123456',
      );

      expect(result).toEqual({
        accessToken: 'real-access-token',
        user: {
          id: twoFaUser.id,
          name: 'John Doe',
          email: twoFaUser.email,
          username: twoFaUser.username,
        },
      });
    });
  });
});
