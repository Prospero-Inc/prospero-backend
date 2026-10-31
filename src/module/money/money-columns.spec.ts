import { withCents } from './money-columns';

describe('withCents', () => {
  it('mirrors amount to amountCents on create', () => {
    expect(
      withCents('Transaction', 'create', {
        data: { amount: 12.34, userId: 1 },
      }),
    ).toEqual({ data: { amount: 12.34, userId: 1, amountCents: 1234 } });
  });

  it('mirrors on update, including the { set } form', () => {
    expect(
      withCents('Salary', 'update', {
        where: { id: 1 },
        data: { amount: { set: 650 } },
      }),
    ).toEqual({
      where: { id: 1 },
      data: { amount: { set: 650 }, amountCents: 65000 },
    });
  });

  it('leaves updates that do not touch the amount alone', () => {
    const args = { where: { id: 1 }, data: { description: 'x' } };
    expect(withCents('Transaction', 'update', args)).toEqual(args);
  });

  it('uses parsedAmount for processed emails and keeps null as null', () => {
    expect(
      withCents('ProcessedEmail', 'create', { data: { parsedAmount: null } }),
    ).toEqual({ data: { parsedAmount: null, parsedAmountCents: null } });
  });

  it('handles createMany and upsert', () => {
    expect(
      withCents('FixedExpense', 'createMany', {
        data: [{ amount: 1 }, { amount: 2.5 }],
      }),
    ).toEqual({
      data: [
        { amount: 1, amountCents: 100 },
        { amount: 2.5, amountCents: 250 },
      ],
    });
    expect(
      withCents('Transaction', 'upsert', {
        create: { amount: 3 },
        update: { amount: 4 },
      }),
    ).toEqual({
      create: { amount: 3, amountCents: 300 },
      update: { amount: 4, amountCents: 400 },
    });
  });

  it('ignores other models and read actions', () => {
    const args = { data: { amount: 5 } };
    expect(withCents('User', 'create', args)).toBe(args);
    expect(withCents('Transaction', 'findMany', args)).toBe(args);
  });

  it('refuses writes it cannot mirror', () => {
    expect(() =>
      withCents('Transaction', 'update', {
        data: { amount: { increment: 1 } },
      }),
    ).toThrow(/Unsupported write/);
  });
});
