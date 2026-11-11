import { BudgetCategory } from '@prisma/client';
import { MerchantRulesService } from './merchant-rules.service';

describe('MerchantRulesService', () => {
  const repository = { findByKey: jest.fn(), upsert: jest.fn() };
  const service = new MerchantRulesService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('upserts under the normalized key', async () => {
    repository.upsert.mockResolvedValue({ id: 1 });

    await service.upsert(
      5,
      ' Súper Selectos Suc. 4 ',
      BudgetCategory.Necesidad,
    );

    expect(repository.upsert).toHaveBeenCalledWith(
      5,
      'super selectos',
      BudgetCategory.Necesidad,
    );
  });

  it('never stores an empty key', async () => {
    const result = await service.upsert(5, '#123', BudgetCategory.Deseo);

    expect(result).toBeNull();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('finds by the normalized key and skips empty ones', async () => {
    repository.findByKey.mockResolvedValue({ category: BudgetCategory.Deseo });

    await expect(service.find(5, 'PUMA #2')).resolves.toEqual({
      category: BudgetCategory.Deseo,
    });
    expect(repository.findByKey).toHaveBeenCalledWith(5, 'puma');

    await expect(service.find(5, '  ')).resolves.toBeNull();
    expect(repository.findByKey).toHaveBeenCalledTimes(1);
  });
});
