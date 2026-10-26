import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { resetPassword: jest.Mock };

  const validToken = '3f2b8c1e-5a4d-4e7b-9c1a-2d3e4f5a6b7c';

  beforeEach(async () => {
    authService = { resetPassword: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UserService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('resetPassword', () => {
    it('throws BadRequestException when passwords do not match', async () => {
      await expect(
        controller.resetPassword(validToken, {
          password: 'MyPass123!',
          confirmPassword: 'MyPass123?',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it.each([
      'Sh0rt!x',
      'alllowercase1!',
      'ALLUPPERCASE1!',
      'NoNumber!!',
      'NoSpecial123',
    ])('throws BadRequestException for weak password %s', async (password) => {
      await expect(
        controller.resetPassword(validToken, {
          password,
          confirmPassword: password,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('answers a malformed token like an unknown one (422)', async () => {
      await expect(
        controller.resetPassword('not-a-uuid', {
          password: 'MyPass123!',
          confirmPassword: 'MyPass123!',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(authService.resetPassword).not.toHaveBeenCalled();
    });

    it('delegates to authService.resetPassword with a valid payload', async () => {
      authService.resetPassword.mockResolvedValue({ ok: true });

      const result = await controller.resetPassword(validToken, {
        password: 'MyPass123!',
        confirmPassword: 'MyPass123!',
      });

      expect(result).toEqual({ ok: true });
      expect(authService.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          resetPasswordToken: validToken,
          password: 'MyPass123!',
        }),
      );
    });

    it('accepts a password longer than 16 characters', async () => {
      const password = 'ALongerPassword123!x';
      expect(password.length).toBeGreaterThan(16);

      await controller.resetPassword(validToken, {
        password,
        confirmPassword: password,
      });

      expect(authService.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ password }),
      );
    });

    it('accepts special characters outside the legacy [-_*.] set', async () => {
      const password = 'Ab1#$%&@(x)';

      await controller.resetPassword(validToken, {
        password,
        confirmPassword: password,
      });

      expect(authService.resetPassword).toHaveBeenCalledTimes(1);
    });
  });
});
