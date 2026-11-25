import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BudgetCategory } from '@prisma/client';
import { UpdateTransactionDto } from './update-transaction.dto';

const invalidProperties = async (body: Record<string, unknown>) => {
  const dto = plainToInstance(UpdateTransactionDto, body, {
    enableImplicitConversion: true,
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((error) => error.property);
};

describe('UpdateTransactionDto', () => {
  it.each(['amount', 'date', 'category'])(
    'rejects %s: null instead of clearing a required column',
    async (property) => {
      expect(await invalidProperties({ [property]: null })).toEqual([property]);
    },
  );

  it('still accepts periodOverride: null (removes the override)', async () => {
    expect(await invalidProperties({ periodOverride: null })).toEqual([]);
  });

  it('accepts a partial body and leaves omitted fields alone', async () => {
    expect(await invalidProperties({})).toEqual([]);
    expect(
      await invalidProperties({
        amount: 10,
        date: '2026-11-01',
        category: BudgetCategory.Deseo,
      }),
    ).toEqual([]);
  });
});
