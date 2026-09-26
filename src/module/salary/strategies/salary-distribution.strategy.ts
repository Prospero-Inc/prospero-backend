export interface SalaryDistributionStrategy {
  distributeSalary(amount: number): {
    necesidad: number;
    deseo: number;
    ahorro: number;
  };
}
