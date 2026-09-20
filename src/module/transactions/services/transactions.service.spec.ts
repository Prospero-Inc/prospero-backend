import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from '../repositories/transactions.repository';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: {
    create: jest.Mock;
    findManyByUser: jest.Mock;
    findOneOwned: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findManyByUser: jest.fn(),
      findOneOwned: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: TransactionsRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a transaction scoped to the given user', async () => {
    const dto = { amount: 10, category: 'food' } as any;
    repository.create.mockResolvedValue({ id: 1, userId: 5, ...dto });

    const result = await service.create(5, dto);

    expect(repository.create).toHaveBeenCalledWith(5, dto);
    expect(result).toEqual({ id: 1, userId: 5, ...dto });
  });

  it('throws NotFoundException when updating a transaction not owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(
      service.update(1, 5, { amount: 20 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('updates a transaction that is owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue({ id: 1, userId: 5 });
    repository.update.mockResolvedValue({ id: 1, userId: 5, amount: 20 });

    const result = await service.update(1, 5, { amount: 20 } as any);

    expect(repository.update).toHaveBeenCalledWith(1, { amount: 20 });
    expect(result).toEqual({ id: 1, userId: 5, amount: 20 });
  });

  it('throws NotFoundException when removing a transaction not owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(service.remove(1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
