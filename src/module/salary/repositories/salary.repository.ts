import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';
import { CreateAmountDto } from '../domain/dto/create-amount.dto';
import { SalaryDistributionStrategy } from '../strategies/salary-distribution.strategy';

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
}
