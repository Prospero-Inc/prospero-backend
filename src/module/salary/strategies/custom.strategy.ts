import { SalaryDistributionStrategy } from './salary-distribution.strategy';

export class CustomStrategy implements SalaryDistributionStrategy {
  constructor(
    private readonly needsPercent: number,
    private readonly wantsPercent: number,
    private readonly savingsPercent: number,
  ) {}

  distributeSalary(amount: number) {
    return {
      necesidad: amount * this.needsPercent,
      deseo: amount * this.wantsPercent,
      ahorro: amount * this.savingsPercent,
    };
  }
}
