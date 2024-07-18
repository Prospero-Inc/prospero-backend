import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDTO } from '../user/dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import { Enable2FAType } from './types';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    loginDTO: LoginDTO,
  ): Promise<
    { accessToken: string } | { validate2FA: string; message: string }
  > {
    const user = await this.userService.findOne(loginDTO.email);

    const passwordMatched = await bcrypt.compare(
      loginDTO.password,
      user.password,
    );

    if (!passwordMatched) {
      return {
        message: 'Invalid credentials',
        accessToken: null,
      };
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
}
