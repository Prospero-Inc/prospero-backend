import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { User } from '@prisma/client';
import { CreateUserDTO } from './dto/create-user.dto';
import { v4 as uuid4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserDTO) {
    const { firstName, lastName, email, usernName } = data;
    const apyKey = uuid4();
    console.log('apyKey: ', apyKey);

    const salt = await bcrypt.genSalt(10);
    const password = await bcrypt.hash(data.password, salt);

    await this.prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        username: usernName,
        password,
        apiKey: apyKey,
      },
    });

    return {
      message: 'User created successfully',
    };
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

  async findByApiKey(apiKey: string): Promise<User> {
    console.log('apiKey: ', apiKey);
    const user = await this.prisma.user.findUnique({
      where: {
        apiKey,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Could not find user 3');
    }
    return user;
  }
}
