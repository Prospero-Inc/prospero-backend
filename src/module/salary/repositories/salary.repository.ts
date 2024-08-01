import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';
import { CreateAmountDto } from '../domain/dto/create-amount.dto';
import { SalaryDistributionStrategy } from '../strategies/salary-distribution.strategy';
import { CURRENT_MONTH, CURRENT_YEAR } from 'src/constants/date-fns';
import { Mes } from '@prisma/client';

@Injectable()
export class SalaryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async distributeSalary(
    userId: number,
    amount: CreateAmountDto,
    strategy: SalaryDistributionStrategy,
  ) {
    const distribution = strategy.distributeSalary(amount.amount);

    const salary = await this.prisma.salary.update({
      where: {
        userId,
      },
      data: {
        amount: amount.amount,
        distribution: {
          create: distribution,
        },
      },
    });

    return salary;
  }

  async createSalary(userId: number, amount: number) {
    return await this.prisma.salary.create({
      data: {
        userId,
        year: 2024,
        month: 'Enero',
        amount,
      },
    });
  }

  async getUserSalaryDetails(userId: number) {
    const salaryData = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        username: true,
        salary: {
          where: {
            month: CURRENT_MONTH as Mes,
            year: CURRENT_YEAR,
          },
          select: {
            amount: true,
            month: true,
            year: true,
            distribution: {
              select: {
                fixedExpenses: true,
                variableExpenses: true,
                savings: true,
              },
            },
          },
        },
      },
    });
    return salaryData;
  }
}
