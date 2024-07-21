import { SalaryDistributionStrategy } from './salary-distribution.strategy';

export class FiftyThirtyTwentyStrategy implements SalaryDistributionStrategy {
  distributeSalary(amount: number) {
    const fixedExpenses = amount * 0.5;
    const variableExpenses = amount * 0.3;
    const savings = amount * 0.2;
    return { fixedExpenses, variableExpenses, savings };
  }
}
