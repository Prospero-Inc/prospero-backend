import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';
import { endOfMonth, startOfMonth } from 'date-fns';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto';
import { UpdateSalaryDto } from '../domain/dto/update-salary.dto';

@Injectable()
export class SalaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, data: CreateSalaryDto) {
    return this.prisma.salary.create({
      data: {
        userId,
        amount: data.amount,
        date: data.date,
        type: data.type,
      },
    });
  }

  findManyByUser(userId: number) {
    return this.prisma.salary.findMany({
      where: { userId },
      orderBy: { date: 'asc' },
    });
  }

  findOneOwned(id: number, userId: number) {
    return this.prisma.salary.findFirst({
      where: { id, userId },
    });
  }

  update(id: number, data: UpdateSalaryDto) {
    return this.prisma.salary.update({
      where: { id },
      data,
    });
  }

  async getUserSalaryDetails(userId: number) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        salary: {
          where: {
            date: {
              gte: startOfMonth(now),
              lte: endOfMonth(now),
            },
          },
          select: {
            amount: true,
            date: true,
            type: true,
          },
          orderBy: { date: 'asc' },
        },
      },
    });
    return user;
  }
}
