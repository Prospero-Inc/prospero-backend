import { Test, TestingModule } from '@nestjs/testing';
import { MovementSource } from '@prisma/client';
import { DuplicateDetectorService } from './duplicate-detector.service';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';

describe('DuplicateDetectorService', () => {
  let service: DuplicateDetectorService;
  let transactionsService: {
    findAllForUser: jest.Mock;
    findDuplicateCandidates: jest.Mock;
  };

  beforeEach(async () => {
    transactionsService = {
      findAllForUser: jest.fn(),
      findDuplicateCandidates: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DuplicateDetectorService,
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    service = module.get<DuplicateDetectorService>(DuplicateDetectorService);
  });

  function manualTransaction(amount: number, date: string, id = 1) {
    return {
      id,
      userId: 5,
      amount,
      date: new Date(date),
      source: MovementSource.Manual,
      category: null,
    } as any;
  }

  it('matches: same amount + same UTC day + an existing manual transaction', async () => {
    const existing = manualTransaction(1.5, '2026-10-07T20:00:00.000Z', 10);
    transactionsService.findAllForUser.mockResolvedValue([existing]);

    const result = await service.findManualDuplicate(
      5,
      1.5,
      new Date('2026-10-07T17:23:44.000Z'),
    );

    expect(result).toEqual(existing);
  });

  it('does not match: same amount, different day', async () => {
    const existing = manualTransaction(1.5, '2026-10-06T23:59:00.000Z', 11);
    transactionsService.findAllForUser.mockResolvedValue([existing]);

    const result = await service.findManualDuplicate(
      5,
      1.5,
      new Date('2026-10-07T17:23:44.000Z'),
    );

    expect(result).toBeNull();
  });

  it('does not match: different amount, same day', async () => {
    const existing = manualTransaction(42.5, '2026-10-07T01:00:00.000Z', 12);
    transactionsService.findAllForUser.mockResolvedValue([existing]);

    const result = await service.findManualDuplicate(
      5,
      1.5,
      new Date('2026-10-07T17:23:44.000Z'),
    );

    expect(result).toBeNull();
  });

  it('does not match a Gmail-sourced transaction, even with the same amount and day', async () => {
    const gmailTransaction = {
      ...manualTransaction(1.5, '2026-10-07T01:00:00.000Z', 13),
      source: MovementSource.Gmail,
    };
    transactionsService.findAllForUser.mockResolvedValue([gmailTransaction]);

    const result = await service.findManualDuplicate(
      5,
      1.5,
      new Date('2026-10-07T17:23:44.000Z'),
    );

    expect(result).toBeNull();
  });

  it('the recurring $1.50 recarga on different days is never a false positive', async () => {
    // Same recurring package amount as the real Banco Agrícola fixtures,
    // logged manually on two different days — classic trap for a naive
    // "same amount anywhere" matcher.
    const sameAmountDifferentDay = manualTransaction(
      1.5,
      '2026-09-24T12:27:07.000Z',
      20,
    );
    transactionsService.findAllForUser.mockResolvedValue([
      sameAmountDifferentDay,
    ]);

    const result = await service.findManualDuplicate(
      5,
      1.5,
      new Date('2026-10-07T17:23:44.000Z'),
    );

    expect(result).toBeNull();
  });

  describe('findShortcutDuplicate', () => {
    const shortcut = (amount: number, date: string, id = 1) =>
      ({
        id,
        userId: 5,
        amount,
        date: new Date(date),
        source: MovementSource.Shortcut,
      }) as any;

    it('queries Shortcut rows from the day before to the day after', async () => {
      transactionsService.findDuplicateCandidates.mockResolvedValue([]);

      await service.findShortcutDuplicate(
        5,
        9.99,
        new Date('2026-11-10T21:30:00.000Z'),
      );

      expect(transactionsService.findDuplicateCandidates).toHaveBeenCalledWith(
        5,
        {
          sources: [MovementSource.Shortcut],
          dateFrom: new Date('2026-11-09T00:00:00.000Z'),
          dateTo: new Date('2026-11-11T23:59:59.999Z'),
        },
      );
    });

    it('matches ±1 cent and ±1 calendar day, closest first', async () => {
      const far = shortcut(9.98, '2026-11-09T08:00:00.000Z', 30);
      const near = shortcut(10.0, '2026-11-11T01:00:00.000Z', 31);
      transactionsService.findDuplicateCandidates.mockResolvedValue([far, near]);

      const result = await service.findShortcutDuplicate(
        5,
        9.99,
        new Date('2026-11-10T21:30:00.000Z'),
      );

      expect(result).toBe(near);
    });

    it('does not match a 2-cent difference or a row two days away', async () => {
      transactionsService.findDuplicateCandidates.mockResolvedValue([
        shortcut(10.01, '2026-11-10T10:00:00.000Z', 32),
        shortcut(9.99, '2026-11-08T23:00:00.000Z', 33),
      ]);

      const result = await service.findShortcutDuplicate(
        5,
        9.99,
        new Date('2026-11-10T21:30:00.000Z'),
      );

      expect(result).toBeNull();
    });
  });
});
