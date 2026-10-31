import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { User } from '@prisma/client';
import { CreateUserDTO } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { v4 as uuid4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';

const SIGNUP_RESPONSE = { message: 'User created successfully' };

@Injectable()
export class UserService {
  #logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(data: CreateUserDTO) {
    try {
      const { firstName, lastName, email, usernName } = data;
      const apyKey = uuid4();

      const salt = await bcrypt.genSalt(10);
      const password = await bcrypt.hash(data.password, salt);

      // An email that already has an account gets the same answer as a new
      // one, after the same hashing work, so signup can't be used to probe
      // which emails are registered. A pending account gets its verification
      // link again (what a confused user re-registering most likely needs).
      const existing = await this.prisma.user.findUnique({ where: { email } });
      if (existing) {
        if (!existing.isActive) {
          await this.mailService
            .sendVerificationUsers(existing)
            .catch((mailError) =>
              this.#logger.error(
                'Failed to resend verification email',
                mailError,
              ),
            );
        }
        return SIGNUP_RESPONSE;
      }

      const user = await this.prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          username: usernName,
          password,
          apiKey: apyKey,
          activationToken: uuid4(),
        },
      });
      // Sent *after* the insert, not inside a transaction: a slow SMTP used
      // to hit Prisma's 5s interactive-transaction timeout (rollback after
      // the email may already have gone out) and any SMTP failure threw away
      // the whole signup. A failed send is recoverable via
      // POST /auth/resend-verification.
      try {
        await this.mailService.sendVerificationUsers(user);
      } catch (mailError) {
        this.#logger.error('Failed to send verification email', mailError);
      }

      return SIGNUP_RESPONSE;
    } catch (error) {
      this.#logger.error('Failed to create user', error);
      if (error.code === 'P2002') {
        // Email raced in between the check and the insert: same answer.
        if (error.meta?.target?.includes?.('email')) return SIGNUP_RESPONSE;
        throw new UnauthorizedException('Username already exists');
      }
      throw new UnauthorizedException('Could not create user');
    }
  }

  /** Stores a *pending* 2FA secret: `enable2FA` is deliberately left as
   * is. Turning 2FA on here (before the user proved their authenticator
   * works) locked out anyone who opened the setup screen and left — login
   * then demanded a code from an app they never configured. */
  async updateSecretKey(id: number, secret: string, qr: string) {
    return await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        twoFASecret: secret,
        qr2FA: qr,
      },
    });
  }

  /** Turns 2FA on — only after a code from the pending secret verified. */
  async confirm2FA(id: number) {
    return await this.prisma.user.update({
      where: { id },
      data: { enable2FA: true },
    });
  }

  async findOne(email: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Could not find user');
    }
    return user;
  }

  async findById(id: number): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Could not find user');
    }
    return user;
  }

  async disable2FA(id: number) {
    await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        enable2FA: false,
        twoFASecret: null,
      },
    });

    return {
      message: '2FA disabled successfully',
    };
  }

  async findProfileById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        username: true,
        isActive: true,
        isGoogleAccount: true,
        enable2FA: true,
        email: true,
        lastName: true,
        firstName: true,
        createdAt: true,
        payFrequency: true,
        needsPercent: true,
        wantsPercent: true,
        savingsPercent: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Could not find user');
    }
    return user;
  }

  async updateProfile(id: number, data: UpdateUserDto) {
    const { needsPercent, wantsPercent, savingsPercent } = data;
    const percentagesProvided = [needsPercent, wantsPercent, savingsPercent];
    if (percentagesProvided.some((value) => value !== undefined)) {
      if (percentagesProvided.some((value) => value === undefined)) {
        throw new BadRequestException(
          'needsPercent, wantsPercent and savingsPercent must be provided together',
        );
      }
      const sum = needsPercent + wantsPercent + savingsPercent;
      if (Math.abs(sum - 1) > 0.001) {
        throw new BadRequestException(
          'needsPercent + wantsPercent + savingsPercent must add up to 1',
        );
      }
    }

    try {
      return await this.prisma.user.update({
        where: {
          id,
        },
        data,
        select: {
          id: true,
          username: true,
          email: true,
          firstName: true,
          lastName: true,
          payFrequency: true,
          needsPercent: true,
          wantsPercent: true,
          savingsPercent: true,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new UnauthorizedException('Username already exists');
      }
      throw error;
    }
  }

  async findOneByIdActivationToken(
    id: number,
    activationToken: string,
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        activationToken: activationToken,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Could not find user');
    }
    return user;
  }

  async activateUser(id: number) {
    return await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        // activationToken is kept on purpose: re-opening the same email
        // link (e.g. phone, then desktop) should say "already active", not
        // "invalid link". It's only ever usable to activate this same account.
        isActive: true,
      },
    });
  }

  /** Nullable lookup — unlike `findOne`, a missing user isn't an error. */
  async findOneByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({ where: { email } });
  }

  async updateActivationToken(id: number, activationToken: string) {
    return await this.prisma.user.update({
      where: { id },
      data: { activationToken },
    });
  }

  async updateResetPasswordToken(
    id: number,
    resetPasswordTokenHash: string,
    resetPasswordExpiresAt: Date,
  ) {
    return await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        resetPasswordToken: resetPasswordTokenHash,
        resetPasswordExpiresAt,
      },
    });
  }

  /**
   * Sets the new password and burns the reset token in one conditional
   * update: only matches while the token is still unused and unexpired, so
   * two concurrent requests with the same link can't both succeed.
   * Returns the user whose password changed, or null if the link is invalid.
   */
  async resetPasswordWithToken(
    resetPasswordTokenHash: string,
    password: string,
    now: Date,
  ): Promise<{ userId: number } | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: resetPasswordTokenHash,
        resetPasswordExpiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (!user) return null;

    const { count } = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        resetPasswordToken: resetPasswordTokenHash,
        resetPasswordExpiresAt: { gt: now },
      },
      data: {
        password,
        resetPasswordToken: null,
        resetPasswordExpiresAt: null,
      },
    });

    return count === 1 ? { userId: user.id } : null;
  }
}
