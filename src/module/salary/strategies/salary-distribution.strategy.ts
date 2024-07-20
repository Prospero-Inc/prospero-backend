export interface SalaryDistributionStrategy {
  distributeSalary(amount: number): {
    fixedExpenses: number;
    variableExpenses: number;
    savings: number;
  };
}
