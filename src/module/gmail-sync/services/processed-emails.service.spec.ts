import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProcessedEmailResult } from '@prisma/client';
import { ProcessedEmailsService } from './processed-emails.service';
import { ProcessedEmailRepository } from '../repositories/processed-email.repository';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';

describe('ProcessedEmailsService', () => {
  let service: ProcessedEmailsService;
  let processedEmailRepository: {
    findOneOwned: jest.Mock;
    markResolved: jest.Mock;
  };
  let transactionsService: { createFromGmail: jest.Mock };

  beforeEach(async () => {
    processedEmailRepository = {
      findOneOwned: jest.fn(),
      markResolved: jest.fn(),
    };
    transactionsService = { createFromGmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessedEmailsService,
        {
          provide: ProcessedEmailRepository,
          useValue: processedEmailRepository,
        },
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    service = module.get<ProcessedEmailsService>(ProcessedEmailsService);
  });

  function possibleDuplicateEmail(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      userId: 5,
      gmailMessageId: 'msg-1',
      result: ProcessedEmailResult.PossibleDuplicate,
      resolvedAt: null,
      parsedAmount: 1.5,
      parsedDate: new Date('2026-10-07T17:23:44.000Z'),
      parsedDescription: 'Pack Datos Ilimitados 1D',
      ...overrides,
    };
  }

  it('throws NotFoundException when the email does not belong to the user (or does not exist)', async () => {
    processedEmailRepository.findOneOwned.mockResolvedValue(null);

    await expect(service.createAnyway(1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the email was never a PossibleDuplicate', async () => {
    processedEmailRepository.findOneOwned.mockResolvedValue(
      possibleDuplicateEmail({ result: ProcessedEmailResult.Created }),
    );

    await expect(service.createAnyway(1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the possible duplicate was already resolved', async () => {
    processedEmailRepository.findOneOwned.mockResolvedValue(
      possibleDuplicateEmail({ resolvedAt: new Date('2026-10-08') }),
    );

    await expect(service.createAnyway(1, 5)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
  });

  it('throws UnprocessableEntityException instead of inventing data when no parsed snapshot was captured', async () => {
    processedEmailRepository.findOneOwned.mockResolvedValue(
      possibleDuplicateEmail({ parsedAmount: null, parsedDate: null }),
    );

    await expect(service.createAnyway(1, 5)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
    expect(processedEmailRepository.markResolved).not.toHaveBeenCalled();
  });

  it('creates the transaction from the parsed snapshot and marks the email resolved on success', async () => {
    const email = possibleDuplicateEmail();
    processedEmailRepository.findOneOwned.mockResolvedValue(email);
    transactionsService.createFromGmail.mockResolvedValue({ id: 999 });

    const result = await service.createAnyway(1, 5);

    expect(transactionsService.createFromGmail).toHaveBeenCalledWith(5, {
      amount: email.parsedAmount,
      date: email.parsedDate,
      description: email.parsedDescription,
      gmailMessageId: email.gmailMessageId,
    });
    expect(processedEmailRepository.markResolved).toHaveBeenCalledWith(1);
    expect(result).toEqual({ id: 999 });
  });

  it('falls back description to undefined (never null) when parsedDescription is null', async () => {
    const email = possibleDuplicateEmail({ parsedDescription: null });
    processedEmailRepository.findOneOwned.mockResolvedValue(email);
    transactionsService.createFromGmail.mockResolvedValue({ id: 999 });

    await service.createAnyway(1, 5);

    expect(transactionsService.createFromGmail).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ description: undefined }),
    );
  });

  describe('dismiss', () => {
    it('throws NotFoundException when the email does not belong to the user (or does not exist)', async () => {
      processedEmailRepository.findOneOwned.mockResolvedValue(null);

      await expect(service.dismiss(1, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(processedEmailRepository.markResolved).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the email was never a PossibleDuplicate', async () => {
      processedEmailRepository.findOneOwned.mockResolvedValue(
        possibleDuplicateEmail({ result: ProcessedEmailResult.Created }),
      );

      await expect(service.dismiss(1, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(processedEmailRepository.markResolved).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the possible duplicate was already resolved', async () => {
      processedEmailRepository.findOneOwned.mockResolvedValue(
        possibleDuplicateEmail({ resolvedAt: new Date('2026-10-08') }),
      );

      await expect(service.dismiss(1, 5)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(processedEmailRepository.markResolved).not.toHaveBeenCalled();
    });

    it('marks the email resolved and creates nothing', async () => {
      processedEmailRepository.findOneOwned.mockResolvedValue(
        possibleDuplicateEmail(),
      );

      await service.dismiss(1, 5);

      expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
      expect(processedEmailRepository.markResolved).toHaveBeenCalledWith(1);
    });
  });
});
