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
import { AccessTokenResponse, RequiresTwoFactorResponse } from './interfaces';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { MailService } from '../mail/mail.service';
import { v4 as uuid4 } from 'uuid';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { translate } from 'src/lib/i18n';
import { PayloadType } from './types';

const PRE_AUTH_TOKEN_TTL = '5m';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async login(
    loginDTO: LoginDTO,
  ): Promise<AccessTokenResponse | RequiresTwoFactorResponse> {
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

    if (user.enable2FA && user.twoFASecret) {
      const preAuthToken = this.jwtService.sign(
        { email: user.email, userId: user.id, pending2FA: true },
        { expiresIn: PRE_AUTH_TOKEN_TTL },
      );

      return {
        requires2FA: true,
        preAuthToken,
        message: `${translate('exception.otpRequired')}`,
      };
    }

    return this.buildAccessTokenResponse(user);
  }

  async verifyLoginTwoFactor(
    preAuthToken: string,
    token: string,
  ): Promise<AccessTokenResponse> {
    let payload: PayloadType;
    try {
      payload = this.jwtService.verify<PayloadType>(preAuthToken);
    } catch (error) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }

    if (!payload.pending2FA) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }

    const user = await this.userService.findById(payload.userId);
    const verified = speakeasy.totp.verify({
      secret: user.twoFASecret,
      token,
      encoding: 'base32',
      window: 1,
    });

    if (!verified) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }

    return this.buildAccessTokenResponse(user);
  }

  private buildAccessTokenResponse(user: User): AccessTokenResponse {
    const payload = { email: user.email, userId: user.id };

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

  async enable2FA(userId: number): Promise<Enable2FAType> {
    const user = await this.userService.findById(userId);
    if (user.enable2FA) {
      return { secret: user.twoFASecret, qr: user.qr2FA };
    }

    const secret = speakeasy.generateSecret();
    console.log({ secret });
    user.twoFASecret = secret.base32;
    user.qr2FA = secret.otpauth_url;
    await this.userService.updateSecretKey(
      user.id,
      user.twoFASecret,
      user.qr2FA,
    );
    return { secret: user.twoFASecret, qr: secret.otpauth_url };
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
