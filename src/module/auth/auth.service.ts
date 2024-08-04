import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDTO } from '../user/dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { Enable2FAType } from './types';
import { ActivateUserDto } from './dto';
import { User } from '@prisma/client';
import { AccessTokenResponse } from './interfaces';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { MailService } from '../mail/mail.service';
import { v4 as uuid4 } from 'uuid';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { translate } from 'src/lib/i18n';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async login(
    loginDTO: LoginDTO,
  ): Promise<AccessTokenResponse | { validate2FA: string; message: string }> {
    const user = await this.userService.findOne(loginDTO.email);

    const passwordMatched = await bcrypt.compare(
      loginDTO.password,
      user.password,
    );

    if (!passwordMatched) {
      throw new UnauthorizedException(
        translate('exception.invalidCredentials'),
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException(translate('exception.inactiveUser'));
    }

    const payload = { email: user.email, userId: user.id };

    if (passwordMatched) {
      if (user.enable2FA && user.twoFASecret) {
        return {
          validate2FA: 'http://localhost:3000/auth/validate-2fa',
          message: `${translate('exception.otpRequired')}`,
        };
      }

      return {
        accessToken: this.jwtService.sign(payload),
        user: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          username: user.username,
        },
      };
    }

    throw new UnauthorizedException(
      translate('exception.passwordDoesNotMatch'),
    );
  }

  async enable2FA(userId: number): Promise<Enable2FAType> {
    const user = await this.userService.findById(userId);
    if (user.enable2FA) {
      return { secret: user.twoFASecret };
    }

    const secret = speakeasy.generateSecret();
    user.twoFASecret = secret.base32;
    await this.userService.updateSecretKey(user.id, user.twoFASecret);
    return { secret: user.twoFASecret };
  }

  async validate2FAToken(
    userId: number,
    token: string,
  ): Promise<{ verified: boolean }> {
    try {
      const user = await this.userService.findById(userId);

      // extract his 2FA secret
      const secret = user.twoFASecret;
      console.log({
        secret,
        user,
      });

      const verified = speakeasy.totp.verify({
        secret: secret,
        token: token,
        encoding: 'base32',
        window: 1,
      });

      return {
        verified: verified,
      };
    } catch (error) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }
  }

  async disable2FA(userId: number) {
    return await this.userService.disable2FA(userId);
  }

  async validateUserByApiKey(apiKey: string) {
    return await this.userService.findByApiKey(apiKey);
  }

  async activateUser(activateUserDto: ActivateUserDto) {
    const { code, id } = activateUserDto;
    const user: User =
      await this.userService.findOneInactiveByIdActivationToken(+id, code);
    if (!user) {
      throw new UnprocessableEntityException('This action can not be done');
    }
    await this.userService.activateUser(id);
  }

  async requestResetPassword(requestResetPassword: RequestResetPasswordDto) {
    const { email } = requestResetPassword;
    try {
      const user: User = await this.userService.findOne(email);
      const resetPasswordToken = uuid4();
      await this.userService.updateResetPasswordToken(
        user.id,
        resetPasswordToken,
      );
      await this.mailService.sendResetPassword(user, resetPasswordToken);
    } catch (error) {
      throw new UnprocessableEntityException('This action can not be done');
    }
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      const { resetPasswordToken, password } = resetPasswordDto;
      const user: User =
        await this.userService.findOneByResetPasswordToken(resetPasswordToken);
      const newPassword = await bcrypt.hash(password, 10);

      await this.userService.updatePassword(user.id, newPassword);

      return {
        message: `${translate('exception.passwordUpdatedSuccess')}`,
      };
    } catch (error) {
      throw new UnprocessableEntityException('This action can not be done');
    }
  }
}
