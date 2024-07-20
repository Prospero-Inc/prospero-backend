import { SalaryDistributionStrategy } from './salary-distribution.strategy';

export class CustomStrategy implements SalaryDistributionStrategy {
  private fixedPercentage: number;
  private variablePercentage: number;
  private savingsPercentage: number;

  constructor(fixed: number, variable: number, savings: number) {
    this.fixedPercentage = fixed;
    this.variablePercentage = variable;
    this.savingsPercentage = savings;
  }

  distributeSalary(amount: number) {
    const fixedExpenses = amount * this.fixedPercentage;
    const variableExpenses = amount * this.variablePercentage;
    const savings = amount * this.savingsPercentage;
    return { fixedExpenses, variableExpenses, savings };
  }
}
