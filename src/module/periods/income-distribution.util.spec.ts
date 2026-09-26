import { IncomeType, Salary } from '@prisma/client';
import { distributeIncomeByCategory } from './income-distribution.util';
import { CustomStrategy } from '../salary/strategies/custom.strategy';

// Only the fields distributeIncomeByCategory actually reads are relevant here.
type Income = Pick<
  Salary,
  'amount' | 'type' | 'budgetCategory' | 'distributeAutomatically'
>;

const payroll = (amount: number): Income => ({
  amount,
  type: IncomeType.Payroll,
  budgetCategory: null,
  distributeAutomatically: false,
});

const extra = (
  amount: number,
  overrides: Partial<
    Pick<Income, 'budgetCategory' | 'distributeAutomatically'>
  > = {},
): Income => ({
  amount,
  type: IncomeType.Extra,
  budgetCategory: null,
  distributeAutomatically: false,
  ...overrides,
});

describe('distributeIncomeByCategory', () => {
  const strategy = new CustomStrategy(0.4, 0.3, 0.3); // founder's split

  it('distributes plain Payroll income through the percentage strategy, unchanged', () => {
    const result = distributeIncomeByCategory([payroll(1000)], strategy);

    expect(result).toEqual({ necesidad: 400, deseo: 300, ahorro: 300 });
  });

  it('assigns an Extra entry earmarked to a category 100% to that category, bypassing the split', () => {
    const result = distributeIncomeByCategory(
      [extra(200, { budgetCategory: 'Ahorro' })],
      strategy,
    );

    expect(result).toEqual({ necesidad: 0, deseo: 0, ahorro: 200 });
  });

  it('runs an Extra entry through the split when distributeAutomatically is true, even if a category was chosen', () => {
    const result = distributeIncomeByCategory(
      [
        extra(1000, {
          budgetCategory: 'Ahorro',
          distributeAutomatically: true,
        }),
      ],
      strategy,
    );

    expect(result).toEqual({ necesidad: 400, deseo: 300, ahorro: 300 });
  });

  it('runs an Extra entry without a chosen category through the split, same as Payroll', () => {
    const result = distributeIncomeByCategory([extra(1000)], strategy);

    expect(result).toEqual({ necesidad: 400, deseo: 300, ahorro: 300 });
  });

  it('mixes Payroll and earmarked Extra income in the same period', () => {
    const result = distributeIncomeByCategory(
      [payroll(1000), extra(100, { budgetCategory: 'Necesidad' })],
      strategy,
    );

    // Payroll's 1000 goes through the 40/30/30 split; the earmarked 100
    // lands entirely on top of necesidad's share.
    expect(result).toEqual({ necesidad: 500, deseo: 300, ahorro: 300 });
  });

  it('leaves the other categories at $0 when earmarking covers 100% of the period income', () => {
    const result = distributeIncomeByCategory(
      [extra(500, { budgetCategory: 'Deseo' })],
      strategy,
    );

    expect(result).toEqual({ necesidad: 0, deseo: 500, ahorro: 0 });
  });

  it('returns all zeros for a period with no income', () => {
    const result = distributeIncomeByCategory([], strategy);

    expect(result).toEqual({ necesidad: 0, deseo: 0, ahorro: 0 });
  });
});
