import { ConflictException, NotFoundException } from '@nestjs/common';
import { BudgetCategory, Prisma } from '@prisma/client';
import { WalletCardsService } from './wallet-cards.service';

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'test',
  });

describe('WalletCardsService', () => {
  const repository = {
    findManyByUser: jest.fn(),
    findOneOwned: jest.fn(),
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    institutionBelongsTo: jest.fn(),
  };
  const service = new WalletCardsService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  describe('findOrCreateByName', () => {
    it('returns the existing card', async () => {
      const card = { id: 1, name: 'BAC Visa', defaultCategory: 'Deseo' };
      repository.findByName.mockResolvedValue(card);

      await expect(service.findOrCreateByName(5, ' BAC Visa ')).resolves.toBe(
        card,
      );
      expect(repository.findByName).toHaveBeenCalledWith(5, 'BAC Visa');
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('auto-registers an unknown card with defaultCategory null', async () => {
      repository.findByName.mockResolvedValue(null);
      repository.create.mockResolvedValue({
        id: 2,
        name: 'Agrícola Débito',
        defaultCategory: null,
        financialInstitution: null,
      });

      const card = await service.findOrCreateByName(5, 'Agrícola Débito');

      expect(repository.create).toHaveBeenCalledWith(5, {
        name: 'Agrícola Débito',
        defaultCategory: null,
      });
      expect(card).toMatchObject({ id: 2, defaultCategory: null });
    });

    it('re-reads the winner when a concurrent request created it first', async () => {
      const winner = { id: 3, name: 'X' };
      repository.findByName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      repository.create.mockRejectedValue(uniqueViolation());

      await expect(service.findOrCreateByName(5, 'X')).resolves.toBe(winner);
    });
  });

  it('create answers 409 for a duplicated name', async () => {
    repository.create.mockRejectedValue(uniqueViolation());

    await expect(
      service.create(5, { name: 'BAC Visa' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('create rejects an institution that is not the user’s', async () => {
    repository.institutionBelongsTo.mockResolvedValue(false);

    await expect(
      service.create(5, { name: 'BAC Visa', financialInstitutionId: 99 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('update 404s on another user’s card', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(
      service.update(1, 5, { defaultCategory: BudgetCategory.Deseo }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('update can clear the default category and flattens the bank name', async () => {
    repository.findOneOwned.mockResolvedValue({ id: 1 });
    repository.update.mockResolvedValue({
      id: 1,
      defaultCategory: null,
      financialInstitution: { name: 'BAC' },
    });

    const result = await service.update(1, 5, { defaultCategory: null });

    expect(repository.update).toHaveBeenCalledWith(1, {
      defaultCategory: null,
    });
    expect(result).toEqual({
      id: 1,
      defaultCategory: null,
      institutionName: 'BAC',
    });
  });

  it('remove 404s on another user’s card', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(service.remove(1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
