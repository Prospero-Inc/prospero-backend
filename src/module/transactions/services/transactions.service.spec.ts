import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MovementSource, TransactionReviewStatus } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { TransactionsRepository } from '../repositories/transactions.repository';
import { MerchantRulesService } from 'src/module/merchant-rules/services/merchant-rules.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let repository: {
    create: jest.Mock;
    findManyByUser: jest.Mock;
    findManyByUserWithLabels: jest.Mock;
    findPossibleDuplicatesFor: jest.Mock;
    countByReviewStatus: jest.Mock;
    findOneOwned: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  let merchantRules: { upsert: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    merchantRules = {
      upsert: jest.fn().mockResolvedValue(null),
      find: jest.fn(),
    };
    repository = {
      create: jest.fn(),
      findManyByUser: jest.fn(),
      findManyByUserWithLabels: jest.fn(),
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
        { provide: MerchantRulesService, useValue: merchantRules },
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
    repository.findManyByUserWithLabels.mockResolvedValue([manualTransaction]);
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
        fixedExpenseName: null,
        institutionName: null,
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
    repository.findManyByUserWithLabels.mockResolvedValue([gmailTransaction]);

    const result = await service.findAllForUserWithPossibleDuplicates(5);

    expect(repository.findPossibleDuplicatesFor).toHaveBeenCalledWith([]);
    expect(result).toEqual([
      {
        ...gmailTransaction,
        fixedExpenseName: null,
        institutionName: null,
        possibleGmailDuplicate: null,
      },
    ]);
  });

  it('findAllForUserWithPossibleDuplicates flattens the fixed expense and bank names into list labels', async () => {
    repository.findManyByUserWithLabels.mockResolvedValue([
      {
        id: 13,
        userId: 5,
        source: MovementSource.Gmail,
        amount: 30,
        fixedExpense: { name: 'Internet' },
        institution: { name: 'Banco Agrícola' },
      },
    ]);
    repository.findPossibleDuplicatesFor.mockResolvedValue([]);

    const result = await service.findAllForUserWithPossibleDuplicates(5);

    expect(result).toEqual([
      {
        id: 13,
        userId: 5,
        source: MovementSource.Gmail,
        amount: 30,
        fixedExpenseName: 'Internet',
        institutionName: 'Banco Agrícola',
        possibleGmailDuplicate: null,
      },
    ]);
  });

  it('findAllForUserWithPossibleDuplicates returns null when no unresolved duplicate matches the row', async () => {
    const manualTransaction = {
      id: 12,
      userId: 5,
      source: MovementSource.Manual,
      amount: 42,
    };
    repository.findManyByUserWithLabels.mockResolvedValue([manualTransaction]);
    repository.findPossibleDuplicatesFor.mockResolvedValue([]);

    const result = await service.findAllForUserWithPossibleDuplicates(5);

    expect(result).toEqual([
      {
        ...manualTransaction,
        fixedExpenseName: null,
        institutionName: null,
        possibleGmailDuplicate: null,
      },
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
  describe('merchant rule learning', () => {
    it('learns the merchant when a review-queue row is confirmed with a category (Shortcut)', async () => {
      repository.findOneOwned.mockResolvedValue({
        id: 1,
        userId: 5,
        source: MovementSource.Shortcut,
        description: 'Puma',
        reviewStatus: TransactionReviewStatus.PendingReview,
        institution: null,
      });
      repository.update.mockResolvedValue({ id: 1 });

      await service.update(1, 5, { category: 'Deseo' } as any);

      expect(merchantRules.upsert).toHaveBeenCalledWith(5, 'Puma', 'Deseo');
    });

    it('learns from a BAC Gmail row (description is the merchant)', async () => {
      repository.findOneOwned.mockResolvedValue({
        id: 2,
        userId: 5,
        source: MovementSource.Gmail,
        description: 'ELECTRONICA STEREN',
        reviewStatus: TransactionReviewStatus.PendingReview,
        institution: { parserKey: 'bac_credomatic' },
      });
      repository.update.mockResolvedValue({ id: 2 });

      await service.update(2, 5, { category: 'Necesidad' } as any);

      expect(merchantRules.upsert).toHaveBeenCalledWith(
        5,
        'ELECTRONICA STEREN',
        'Necesidad',
      );
    });

    it('does not learn from a Banco Agrícola Gmail row (description is a field blob)', async () => {
      repository.findOneOwned.mockResolvedValue({
        id: 3,
        userId: 5,
        source: MovementSource.Gmail,
        description: 'Compañía: CLARO, PREPAGO (RECARGA); Paquete: Pack',
        reviewStatus: TransactionReviewStatus.PendingReview,
        institution: { parserKey: 'banco_agricola' },
      });
      repository.update.mockResolvedValue({ id: 3 });

      await service.update(3, 5, { category: 'Necesidad' } as any);

      expect(repository.update).toHaveBeenCalled();
      expect(merchantRules.upsert).not.toHaveBeenCalled();
    });

    it('learns from an edited Manual row, using the new description when the PATCH changes it', async () => {
      repository.findOneOwned.mockResolvedValue({
        id: 4,
        userId: 5,
        source: MovementSource.Manual,
        description: 'old',
        reviewStatus: TransactionReviewStatus.Confirmed,
        institution: null,
      });
      repository.update.mockResolvedValue({ id: 4 });

      await service.update(4, 5, {
        category: 'Ahorro',
        description: 'Pricesmart',
      } as any);

      expect(merchantRules.upsert).toHaveBeenCalledWith(5, 'Pricesmart', 'Ahorro');
    });

    it('does not learn when the PATCH has no category or the row has no description', async () => {
      repository.findOneOwned.mockResolvedValue({
        id: 5,
        userId: 5,
        source: MovementSource.Manual,
        description: null,
        reviewStatus: TransactionReviewStatus.Confirmed,
        institution: null,
      });
      repository.update.mockResolvedValue({ id: 5 });

      await service.update(5, 5, { amount: 3 } as any);
      await service.update(5, 5, { category: 'Deseo' } as any);

      expect(merchantRules.upsert).not.toHaveBeenCalled();
    });

    it('never learns when creating a manual expense', async () => {
      repository.create.mockResolvedValue({ id: 9 });

      await service.create(5, {
        amount: 3,
        date: new Date(),
        category: 'Deseo',
        description: 'Puma',
      } as any);

      expect(merchantRules.upsert).not.toHaveBeenCalled();
    });

    it('still returns the updated row when learning fails', async () => {
      repository.findOneOwned.mockResolvedValue({
        id: 6,
        userId: 5,
        source: MovementSource.Shortcut,
        description: 'Puma',
        reviewStatus: TransactionReviewStatus.PendingReview,
        institution: null,
      });
      repository.update.mockResolvedValue({ id: 6 });
      merchantRules.upsert.mockRejectedValue(new Error('db down'));

      await expect(
        service.update(6, 5, { category: 'Deseo' } as any),
      ).resolves.toEqual({ id: 6 });
    });
  });
});
