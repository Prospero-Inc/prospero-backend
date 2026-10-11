import { Test, TestingModule } from '@nestjs/testing';
import { MovementSource } from '@prisma/client';
import { DuplicateDetectorService } from './duplicate-detector.service';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';

describe('DuplicateDetectorService', () => {
  let service: DuplicateDetectorService;
  let transactionsService: { findAllForUser: jest.Mock };

  beforeEach(async () => {
    transactionsService = { findAllForUser: jest.fn() };

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
});
