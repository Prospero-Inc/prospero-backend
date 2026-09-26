import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BudgetCategory, IncomeType } from '@prisma/client';
import { FixedExpensesService } from './fixed-expenses.service';
import { FixedExpensesRepository } from '../repositories/fixed-expenses.repository';
import { SalaryService } from '../../salary/services/salary.service';
import { TransactionsService } from '../../transactions/services/transactions.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Two payrolls in September split the month into: [..Aug31], [Sep1-14 open? no]
// -> periods: index0 (..Aug31), index1 (Sep1-14), index2 (Sep15-open).
const PAYROLLS = [
  { type: IncomeType.Payroll, date: d('2026-09-01') },
  { type: IncomeType.Payroll, date: d('2026-09-15') },
];

describe('FixedExpensesService', () => {
  let service: FixedExpensesService;
  let repository: {
    create: jest.Mock;
    findManyByUser: jest.Mock;
    findOneOwned: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let salaryService: { findAllForUser: jest.Mock };
  let transactionsService: { findAllForUser: jest.Mock; create: jest.Mock };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findManyByUser: jest.fn(),
      findOneOwned: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    salaryService = { findAllForUser: jest.fn().mockResolvedValue(PAYROLLS) };
    transactionsService = {
      findAllForUser: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FixedExpensesService,
        { provide: FixedExpensesRepository, useValue: repository },
        { provide: SalaryService, useValue: salaryService },
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    service = module.get<FixedExpensesService>(FixedExpensesService);

    jest.useFakeTimers().setSystemTime(d('2026-09-20'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a fixed expense scoped to the given user', async () => {
    const dto = { amount: 10, name: 'Renta' } as any;
    repository.create.mockResolvedValue({ id: 1, userId: 5, ...dto });

    const result = await service.create(5, dto);

    expect(repository.create).toHaveBeenCalledWith(5, dto);
    expect(result).toEqual({ id: 1, userId: 5, ...dto });
  });

  it('throws NotFoundException when updating a fixed expense not owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(
      service.update(1, 5, { amount: 20 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when removing a fixed expense not owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(service.remove(1, 5)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });

  describe('findAllForUser', () => {
    it('distinguishes paidThisCycle across fixed expenses that fall in different half-month periods', async () => {
      const appleMusic = {
        id: 1,
        userId: 5,
        amount: 15,
        name: 'Apple Music',
        budgetCategory: BudgetCategory.Deseo,
        dueDate: d('2024-01-09'),
        reminder: true,
        description: null,
      };
      const claudeCode = {
        id: 2,
        userId: 5,
        amount: 20,
        name: 'Claude Code',
        budgetCategory: BudgetCategory.Necesidad,
        dueDate: d('2024-01-18'),
        reminder: true,
        description: null,
      };
      repository.findManyByUser.mockResolvedValue([appleMusic, claudeCode]);
      // Apple Music's Sep-9 occurrence was already paid; Claude Code's
      // Sep-18 occurrence was not.
      transactionsService.findAllForUser.mockResolvedValue([
        {
          id: 99,
          userId: 5,
          amount: 15,
          date: d('2026-09-09'),
          category: BudgetCategory.Deseo,
          periodOverride: null,
          fixedExpenseId: 1,
        },
      ]);

      const result = await service.findAllForUser(5);

      expect(result.find((fe) => fe.id === 1)?.paidThisCycle).toBe(true);
      expect(result.find((fe) => fe.id === 2)?.paidThisCycle).toBe(false);
    });
  });

  describe('pay', () => {
    const fixedExpense = {
      id: 1,
      userId: 5,
      amount: 15,
      name: 'Apple Music',
      budgetCategory: BudgetCategory.Deseo,
      dueDate: d('2024-01-09'),
      reminder: true,
      description: null,
    };

    it('throws NotFoundException when the fixed expense is not owned by the user', async () => {
      repository.findOneOwned.mockResolvedValue(null);

      await expect(service.pay(1, 5)).rejects.toBeInstanceOf(NotFoundException);
      expect(transactionsService.create).not.toHaveBeenCalled();
    });

    it('creates a transaction dated at the day-of-month occurrence, not at the pay-click date', async () => {
      repository.findOneOwned.mockResolvedValue(fixedExpense);
      transactionsService.create.mockResolvedValue({ id: 100 });

      // "today" is faked to 2026-09-20, but the due day is the 9th.
      await service.pay(1, 5);

      expect(transactionsService.create).toHaveBeenCalledWith(5, {
        amount: 15,
        date: d('2026-09-09'),
        category: BudgetCategory.Deseo,
        description: 'Apple Music',
        fixedExpenseId: 1,
      });
    });

    it('throws ConflictException and does not create a transaction when this cycle was already paid', async () => {
      repository.findOneOwned.mockResolvedValue(fixedExpense);
      const existing = {
        id: 99,
        userId: 5,
        amount: 15,
        date: d('2026-09-09'),
        category: BudgetCategory.Deseo,
        periodOverride: null,
        fixedExpenseId: 1,
      };
      transactionsService.findAllForUser.mockResolvedValue([existing]);

      await expect(service.pay(1, 5)).rejects.toBeInstanceOf(ConflictException);
      expect(transactionsService.create).not.toHaveBeenCalled();
    });
  });
});
