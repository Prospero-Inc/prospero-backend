import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { User } from '@prisma/client';
import { CreateUserDTO } from './dto/create-user.dto';
import { v4 as uuid4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { MailService } from '../mail/mail.service';

@Injectable()
export class UserService {
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
      let user;
      await this.prisma.$transaction(async (tx) => {
        user = await tx.user.create({
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
        await this.mailService.sendVerificationUsers(user);
      });

      return {
        message: 'User created successfully',
      };
    } catch (error) {
      console.log('error: ', error);
      if (error.code === 'P2002') {
        throw new UnauthorizedException('Email or Username already exists');
      }
      throw new UnauthorizedException('Could not create user');
    }
  }

  async updateSecretKey(id: number, secret: string) {
    return await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        twoFASecret: secret,
        enable2FA: true,
      },
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

  async findByApiKey(email: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        username: true,
        isActive: true,
        isGoogleAccount: true,
        activationToken: true,
        enable2FA: true,
        twoFASecret: true,
        email: true,
        lastName: true,
        firstName: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Could not find user 3');
    }
    return user;
  }

  async findOneInactiveByIdActivationToken(
    id: number,
    activationToken: string,
  ): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        activationToken: activationToken,
        isActive: false,
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
        isActive: true,
        activationToken: null,
      },
    });
  }

  async updateResetPasswordToken(id: number, resetPasswordToken: string) {
    return await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        resetPasswordToken,
      },
    });
  }

  async findOneByResetPasswordToken(resetPasswordToken: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Could not find user');
    }
    return user;
  }

  async updatePassword(id: number, password: string) {
    return await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        password,
        resetPasswordToken: null,
      },
    });
  }
}
