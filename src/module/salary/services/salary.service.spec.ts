import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IncomeReviewStatus, IncomeType, MovementSource } from '@prisma/client';
import { SalaryService } from './salary.service';
import { SalaryRepository } from '../repositories/salary.repository';
import { CustomStrategy } from '../strategies/custom.strategy';

describe('SalaryService', () => {
  let service: SalaryService;
  let repository: {
    create: jest.Mock;
    findManyByUser: jest.Mock;
    findPossibleDuplicatesFor: jest.Mock;
    countByStatus: jest.Mock;
    findOneOwned: jest.Mock;
    update: jest.Mock;
    getUserSalaryDetails: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findManyByUser: jest.fn(),
      findPossibleDuplicatesFor: jest.fn().mockResolvedValue([]),
      countByStatus: jest.fn(),
      findOneOwned: jest.fn(),
      update: jest.fn(),
      getUserSalaryDetails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryService,
        { provide: SalaryRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<SalaryService>(SalaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a salary entry scoped to the given user', async () => {
    repository.create.mockResolvedValue({ id: 1 });

    const result = await service.create(5, {
      amount: 2000,
      date: new Date('2026-09-13'),
    } as any);

    expect(repository.create).toHaveBeenCalledWith(5, {
      amount: 2000,
      date: new Date('2026-09-13'),
    });
    expect(result).toEqual({ message: 'Salario creado exitosamente' });
  });

  it('throws NotFoundException when updating a salary not owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(
      service.update(1, 5, { amount: 100 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('auto-transitions status PendingReview -> Classified when incomeCategory is set on a detected income', async () => {
    repository.findOneOwned.mockResolvedValue({
      id: 1,
      userId: 5,
      type: IncomeType.Extra,
      status: IncomeReviewStatus.PendingReview,
    });
    repository.update.mockResolvedValue({ id: 1 });

    await service.update(1, 5, {
      incomeCategory: 'Deposit',
    } as any);

    expect(repository.update).toHaveBeenCalledWith(1, {
      incomeCategory: 'Deposit',
      status: IncomeReviewStatus.Classified,
    });
  });

  it('does not touch status when the income was already Classified', async () => {
    repository.findOneOwned.mockResolvedValue({
      id: 1,
      userId: 5,
      type: IncomeType.Extra,
      status: IncomeReviewStatus.Classified,
    });
    repository.update.mockResolvedValue({ id: 1 });

    await service.update(1, 5, { incomeCategory: 'Deposit' } as any);

    expect(repository.update).toHaveBeenCalledWith(1, {
      incomeCategory: 'Deposit',
    });
  });

  it('does not set status when the PATCH does not touch incomeCategory', async () => {
    repository.findOneOwned.mockResolvedValue({
      id: 1,
      userId: 5,
      type: IncomeType.Extra,
      status: IncomeReviewStatus.PendingReview,
    });
    repository.update.mockResolvedValue({ id: 1 });

    await service.update(1, 5, { amount: 500 } as any);

    expect(repository.update).toHaveBeenCalledWith(1, { amount: 500 });
  });

  it('findAllForUserWithPossibleDuplicates annotates a Manual income row with its unresolved PossibleDuplicate email', async () => {
    const manualSalary = {
      id: 20,
      userId: 5,
      source: MovementSource.Manual,
      amount: 500,
    };
    repository.findManyByUser.mockResolvedValue([manualSalary]);
    repository.findPossibleDuplicatesFor.mockResolvedValue([
      {
        relatedSalaryId: 20,
        senderEmail: 'alertas@bancoagricola.com',
        processedAt: new Date('2026-10-07T17:23:44.000Z'),
      },
    ]);

    const result = await service.findAllForUserWithPossibleDuplicates(5);

    expect(repository.findPossibleDuplicatesFor).toHaveBeenCalledWith([20]);
    expect(result).toEqual([
      {
        ...manualSalary,
        possibleGmailDuplicate: {
          senderEmail: 'alertas@bancoagricola.com',
          processedAt: new Date('2026-10-07T17:23:44.000Z'),
        },
      },
    ]);
  });

  it('countPendingReview counts Detected + PendingReview income rows for the user', async () => {
    repository.countByStatus.mockResolvedValue(2);

    const result = await service.countPendingReview(5);

    expect(repository.countByStatus).toHaveBeenCalledWith(5, [
      IncomeReviewStatus.Detected,
      IncomeReviewStatus.PendingReview,
    ]);
    expect(result).toBe(2);
  });

  it('previews the distribution using the given strategy', () => {
    const strategy = new CustomStrategy(0.4, 0.3, 0.3);

    const result = service.distributeSalaryPreview(1000, strategy);

    expect(result.distribution).toEqual({
      necesidad: 400,
      deseo: 300,
      ahorro: 300,
    });
  });
});
