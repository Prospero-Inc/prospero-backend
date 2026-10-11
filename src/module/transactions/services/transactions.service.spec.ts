import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MovementSource, TransactionReviewStatus } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from '../repositories/transactions.repository';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: {
    create: jest.Mock;
    findManyByUser: jest.Mock;
    findPossibleDuplicatesFor: jest.Mock;
    countByReviewStatus: jest.Mock;
    findOneOwned: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findManyByUser: jest.fn(),
      findPossibleDuplicatesFor: jest.fn().mockResolvedValue([]),
      countByReviewStatus: jest.fn(),
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

  it('auto-transitions reviewStatus PendingReview -> Confirmed when category is set on a detected transaction', async () => {
    repository.findOneOwned.mockResolvedValue({
      id: 1,
      userId: 5,
      reviewStatus: TransactionReviewStatus.PendingReview,
    });
    repository.update.mockResolvedValue({ id: 1 });

    await service.update(1, 5, { category: 'Necesidad' } as any);

    expect(repository.update).toHaveBeenCalledWith(1, {
      category: 'Necesidad',
      reviewStatus: TransactionReviewStatus.Confirmed,
    });
  });

  it('does not touch reviewStatus when the transaction was already Confirmed', async () => {
    repository.findOneOwned.mockResolvedValue({
      id: 1,
      userId: 5,
      reviewStatus: TransactionReviewStatus.Confirmed,
    });
    repository.update.mockResolvedValue({ id: 1 });

    await service.update(1, 5, { category: 'Necesidad' } as any);

    expect(repository.update).toHaveBeenCalledWith(1, {
      category: 'Necesidad',
    });
  });

  it('does not set reviewStatus when the PATCH does not touch category', async () => {
    repository.findOneOwned.mockResolvedValue({
      id: 1,
      userId: 5,
      reviewStatus: TransactionReviewStatus.PendingReview,
    });
    repository.update.mockResolvedValue({ id: 1 });

    await service.update(1, 5, { amount: 20 } as any);

    expect(repository.update).toHaveBeenCalledWith(1, { amount: 20 });
  });

  it('findAllForUserWithPossibleDuplicates annotates a Manual row with its unresolved PossibleDuplicate email', async () => {
    const manualTransaction = {
      id: 10,
      userId: 5,
      source: MovementSource.Manual,
      amount: 1.5,
    };
    repository.findManyByUser.mockResolvedValue([manualTransaction]);
    repository.findPossibleDuplicatesFor.mockResolvedValue([
      {
        relatedTransactionId: 10,
        senderEmail: 'alertas@bancoagricola.com',
        processedAt: new Date('2026-10-07T17:23:44.000Z'),
      },
    ]);

    const result = await service.findAllForUserWithPossibleDuplicates(5);

    expect(repository.findPossibleDuplicatesFor).toHaveBeenCalledWith([10]);
    expect(result).toEqual([
      {
        ...manualTransaction,
        possibleGmailDuplicate: {
          senderEmail: 'alertas@bancoagricola.com',
          processedAt: new Date('2026-10-07T17:23:44.000Z'),
        },
      },
    ]);
  });

  it('findAllForUserWithPossibleDuplicates never looks up duplicates for a Gmail-sourced row and returns null', async () => {
    const gmailTransaction = {
      id: 11,
      userId: 5,
      source: MovementSource.Gmail,
      amount: 25,
    };
    repository.findManyByUser.mockResolvedValue([gmailTransaction]);

    const result = await service.findAllForUserWithPossibleDuplicates(5);

    expect(repository.findPossibleDuplicatesFor).toHaveBeenCalledWith([]);
    expect(result).toEqual([
      { ...gmailTransaction, possibleGmailDuplicate: null },
    ]);
  });

  it('findAllForUserWithPossibleDuplicates returns null when no unresolved duplicate matches the row', async () => {
    const manualTransaction = {
      id: 12,
      userId: 5,
      source: MovementSource.Manual,
      amount: 42,
    };
    repository.findManyByUser.mockResolvedValue([manualTransaction]);
    repository.findPossibleDuplicatesFor.mockResolvedValue([]);

    const result = await service.findAllForUserWithPossibleDuplicates(5);

    expect(result).toEqual([
      { ...manualTransaction, possibleGmailDuplicate: null },
    ]);
  });

  it('countPendingReview counts Detected + PendingReview rows for the user', async () => {
    repository.countByReviewStatus.mockResolvedValue(3);

    const result = await service.countPendingReview(5);

    expect(repository.countByReviewStatus).toHaveBeenCalledWith(5, [
      TransactionReviewStatus.Detected,
      TransactionReviewStatus.PendingReview,
    ]);
    expect(result).toBe(3);
  });

  it('throws NotFoundException when removing a transaction not owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(service.remove(1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
