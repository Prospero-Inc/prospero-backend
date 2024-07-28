import {
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
import { ActivateUserDto, GoogleLoginUserDto } from './dto';
import { User } from '@prisma/client';
import { AccessTokenResponse } from './interfaces';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { MailService } from '../mail/mail.service';
import { v4 as uuid4 } from 'uuid';
import { ResetPasswordDto } from './dto/reset-password.dto';

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
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is not active');
    }

    const payload = { email: user.email, userId: user.id };

    if (passwordMatched) {
      if (user.enable2FA && user.twoFASecret) {
        return {
          validate2FA: 'http://localhost:3000/auth/validate-2fa',
          message:
            'Please sends the one time password/token from your Google Authenticator App',
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

    throw new UnauthorizedException('Password does not match');
  }

  async enable2FA(userId: number): Promise<Enable2FAType> {
    const user = await this.userService.findById(userId);
    if (user.enable2FA) {
      return { secret: user.twoFASecret };
    }

    const secret = speakeasy.generateSecret();
    console.log('awwwww', secret);
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

      console.log('verified', verified);

      return {
        verified: verified,
      };
    } catch (error) {
      throw new UnauthorizedException('Error verifying token');
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
        message:
          'Your password has been successfully updated. Please use your new password the next time you log in.',
      };
    } catch (error) {
      throw new UnprocessableEntityException('This action can not be done');
    }
  }

  async googleLogin(user: GoogleLoginUserDto) {
    try {
      if (!user.email_verified) {
        throw new UnauthorizedException('No user from google');
      }

      let userExists = await this.userService.findOne(user.email);
      if (!userExists) {
        userExists = await this.userService.createUserGoogle(user);
      }
      const access_token = this.jwtService.sign({
        id: userExists.id,
        email: userExists.email,
        id_token: user.id_token,
        accessToken: user.accessToken,
        expires_in: user.expires_in,
        sub: userExists.id,
      });

      return {
        access_token,
      };
    } catch (error) {
      console.log('error: ', error);
      throw new UnauthorizedException(
        'No user from google or could not create user',
      );
    }
  }
}
