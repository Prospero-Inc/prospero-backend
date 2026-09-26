import { BudgetCategory, IncomeType, Salary } from '@prisma/client';
import { SalaryDistributionStrategy } from '../salary/strategies/salary-distribution.strategy';

export type BudgetedByCategory = {
  necesidad: number;
  deseo: number;
  ahorro: number;
};

export const CATEGORY_TO_BUDGET_KEY: Record<
  BudgetCategory,
  keyof BudgetedByCategory
> = {
  [BudgetCategory.Necesidad]: 'necesidad',
  [BudgetCategory.Deseo]: 'deseo',
  [BudgetCategory.Ahorro]: 'ahorro',
};

/**
 * A `Salary` counts as "earmarked" when it's an `Extra` entry with an explicit
 * `budgetCategory` and `distributeAutomatically` left off (the default):
 * that amount is meant to land 100% in a single budget category instead of
 * being split by the user's percentage strategy. Everything else — every
 * `Payroll` entry, and any `Extra` entry without a category or with
 * `distributeAutomatically: true` — behaves like today and goes into the
 * pool that gets run through the strategy.
 */
function isEarmarked(
  salary: Pick<Salary, 'type' | 'budgetCategory' | 'distributeAutomatically'>,
): boolean {
  return (
    salary.type === IncomeType.Extra &&
    salary.budgetCategory != null &&
    !salary.distributeAutomatically
  );
}

/**
 * Splits a period's income entries into the amount `budgeted` per category,
 * combining category-earmarked `Extra` income (assigned 100% to its chosen
 * category, bypassing the split) with the remaining "pool" income (every
 * `Payroll` entry, plus any `Extra` entry that wasn't earmarked), which is
 * distributed by `strategy` exactly as before this feature existed.
 */
export function distributeIncomeByCategory(
  incomes: Pick<
    Salary,
    'amount' | 'type' | 'budgetCategory' | 'distributeAutomatically'
  >[],
  strategy: SalaryDistributionStrategy,
): BudgetedByCategory {
  const earmarked: BudgetedByCategory = {
    necesidad: 0,
    deseo: 0,
    ahorro: 0,
  };
  let pool = 0;

  for (const income of incomes) {
    if (isEarmarked(income)) {
      const key = CATEGORY_TO_BUDGET_KEY[income.budgetCategory];
      earmarked[key] += income.amount;
    } else {
      pool += income.amount;
    }
  }

  const poolDistribution = strategy.distributeSalary(pool);

  return {
    necesidad: earmarked.necesidad + poolDistribution.necesidad,
    deseo: earmarked.deseo + poolDistribution.deseo,
    ahorro: earmarked.ahorro + poolDistribution.ahorro,
  };
}
