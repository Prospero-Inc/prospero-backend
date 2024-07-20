import { Injectable } from '@nestjs/common';
import { SalaryRepository } from '../repositories/salary.repository';
import { CreateAmountDto } from '../domain/dto/create-amount.dto';
import { SalaryDistributionStrategy } from '../strategies/salary-distribution.strategy';

@Injectable()
export class SalaryService {
  private strategy: SalaryDistributionStrategy;

  constructor(private readonly salaryRepository: SalaryRepository) {}

  setStrategy(strategy: SalaryDistributionStrategy) {
    this.strategy = strategy;
  }

  async distributeSalary(userId: number, amount: CreateAmountDto) {
    if (!this.strategy) {
      throw new Error('Strategy not set');
    }
    return await this.salaryRepository.distributeSalary(
      userId,
      amount,
      this.strategy,
    );
  }

  async createSalary(userId: number, amount: number) {
    return await this.salaryRepository.createSalary(userId, amount);
  }
}
