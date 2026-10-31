import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { LoginDTO } from '../user/dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import { Enable2FAType, PayloadType, TOKEN_TYPE } from './types';
import { ActivateUserDto, ResendVerificationDto } from './dto';
import { User } from '@prisma/client';
import { AccessTokenResponse, RequiresTwoFactorResponse } from './interfaces';
import { RequestResetPasswordDto } from './dto/request-reset-password.dto';
import { MailService } from '../mail/mail.service';
import { v4 as uuid4 } from 'uuid';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { translate } from 'src/lib/i18n';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS,
} from './auth.constants';

const PRE_AUTH_TOKEN_TTL = '5m';

@Injectable()
export class AuthService {
  #logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly refreshTokenRepository: RefreshTokenRepository,
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
        { email: user.email, userId: user.id, typ: TOKEN_TYPE.PreAuth },
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

    if (payload.typ !== TOKEN_TYPE.PreAuth) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }

    const user = await this.userService.findById(payload.userId);

    if (!this.isValidTotp(user.twoFASecret, token)) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }

    return this.buildAccessTokenResponse(user);
  }

  /**
   * Exchanges a valid, unrevoked refresh token for a brand new access + refresh
   * token pair, revoking the presented one in the process (rotation).
   *
   * Reuse detection: a refresh token that is already `revokedAt != null` being
   * presented again indicates a stolen/replayed token (a legitimate client always
   * moves forward to the latest one) — the whole token family for that user is
   * revoked as a security backstop before responding 401.
   */
  async refreshToken(rawRefreshToken: string): Promise<AccessTokenResponse> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const storedToken =
      await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedException(
        translate('exception.invalidRefreshToken'),
      );
    }

    if (storedToken.revokedAt) {
      await this.refreshTokenRepository.revokeAllForUser(storedToken.userId);
      throw new UnauthorizedException(
        translate('exception.invalidRefreshToken'),
      );
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException(
        translate('exception.invalidRefreshToken'),
      );
    }

    const user = await this.userService.findById(storedToken.userId);
    const response = await this.buildAccessTokenResponse(user);

    await this.refreshTokenRepository.revoke(
      tokenHash,
      this.hashToken(response.refreshToken),
    );

    return response;
  }

  /**
   * Revokes the given refresh token server-side so "sign out" actually invalidates
   * the session rather than just clearing client state. Idempotent: does nothing
   * (and never throws) if the token is unknown or already revoked.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const storedToken =
      await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!storedToken || storedToken.revokedAt) {
      return;
    }

    await this.refreshTokenRepository.revoke(tokenHash);
  }

  private async buildAccessTokenResponse(
    user: User,
  ): Promise<AccessTokenResponse> {
    const payload: PayloadType = {
      email: user.email,
      userId: user.id,
      typ: TOKEN_TYPE.Access,
    };
    const refreshToken = await this.issueRefreshToken(user.id);

    return {
      accessToken: this.jwtService.sign(payload),
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      user: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        username: user.username,
      },
    };
  }

  private async issueRefreshToken(userId: number): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.refreshTokenRepository.create(
      userId,
      this.hashToken(rawToken),
      expiresAt,
    );

    return rawToken;
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  async enable2FA(userId: number): Promise<Enable2FAType> {
    const user = await this.userService.findById(userId);
    // Never hand the secret out again once it is active: an access token
    // alone must not be enough to clone the user's authenticator.
    if (user.enable2FA) {
      throw new ConflictException(
        translate('exception.twoFactorAlreadyEnabled'),
      );
    }

    // Pending until validate2FAToken confirms a code — see
    // UserService.updateSecretKey.
    const secret = speakeasy.generateSecret();
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
      if (!user.twoFASecret) {
        return { verified: false };
      }

      const verified = this.isValidTotp(user.twoFASecret, token);

      // First correct code from the pending secret: this is what actually
      // turns 2FA on (enable2FA only stores the secret).
      if (verified && !user.enable2FA) {
        await this.userService.confirm2FA(userId);
      }

      return { verified };
    } catch (error) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }
  }

  /** Requires a current TOTP code, so a stolen access token cannot turn 2FA off. */
  async disable2FA(userId: number, token: string) {
    const user = await this.userService.findById(userId);

    if (!user.enable2FA || !this.isValidTotp(user.twoFASecret, token)) {
      throw new UnauthorizedException(
        translate('exception.errorVerifyingToken'),
      );
    }

    return await this.userService.disable2FA(userId);
  }

  private isValidTotp(secret: string | null, token: string): boolean {
    if (!secret) return false;

    return speakeasy.totp.verify({
      secret,
      token,
      encoding: 'base32',
      window: 1,
    });
  }

  async activateUser(activateUserDto: ActivateUserDto) {
    const { code, id } = activateUserDto;
    const user: User = await this.userService.findOneByIdActivationToken(
      +id,
      code,
    );
    if (!user) {
      throw new UnprocessableEntityException('This action can not be done');
    }
    if (!user.isActive) await this.userService.activateUser(user.id);
  }

  async requestResetPassword(requestResetPassword: RequestResetPasswordDto) {
    const { email } = requestResetPassword;
    const user = await this.userService.findOneByEmail(email);
    // Unknown email → same silent success as a known one, so this endpoint
    // can't be used to probe which emails have an account.
    if (!user) return;

    const resetPasswordToken = uuid4();
    await this.userService.updateResetPasswordToken(
      user.id,
      resetPasswordToken,
    );
    try {
      await this.mailService.sendResetPassword(user, resetPasswordToken);
    } catch (error) {
      this.#logger.error('Failed to send reset-password email', error);
      throw new UnprocessableEntityException('This action can not be done');
    }
  }

  async resendVerification({ email }: ResendVerificationDto) {
    const user = await this.userService.findOneByEmail(email);
    // Generic response whether the email is unknown, already active, or just
    // got a fresh link — never reveal which.
    if (user && !user.isActive) {
      // Reuse the existing token rather than rotating it: rotating made every
      // earlier email's link "invalid" (and left no valid link at all if this
      // send then failed). The token doesn't expire, so rotation bought nothing.
      const updated = user.activationToken
        ? user
        : await this.userService.updateActivationToken(user.id, uuid4());
      try {
        await this.mailService.sendVerificationUsers(updated);
      } catch (error) {
        this.#logger.error('Failed to resend verification email', error);
        throw new UnprocessableEntityException('This action can not be done');
      }
    }
    return {
      message: 'If the account exists and is pending, we sent a new link.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    try {
      const { resetPasswordToken, password } = resetPasswordDto;
      const user: User =
        await this.userService.findOneByResetPasswordToken(resetPasswordToken);
      const newPassword = await bcrypt.hash(password, 10);

      await this.userService.updatePassword(user.id, newPassword);
      // Whoever forced a reset may be locking out an attacker: kill every
      // existing session so a stolen refresh token stops working too.
      await this.refreshTokenRepository.revokeAllForUser(user.id);

      return {
        message: `${translate('exception.passwordUpdatedSuccess')}`,
      };
    } catch (error) {
      throw new UnprocessableEntityException('This action can not be done');
    }
  }
}
