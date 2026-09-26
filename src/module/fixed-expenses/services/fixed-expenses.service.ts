import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IncomeType, Transaction } from '@prisma/client';
import { FixedExpensesRepository } from '../repositories/fixed-expenses.repository';
import { CreateFixedExpenseDto } from '../dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from '../dto/update-fixed-expense.dto';
import { SalaryService } from '../../salary/services/salary.service';
import { TransactionsService } from '../../transactions/services/transactions.service';
import {
  ComputedPeriod,
  computePeriods,
  resolvePeriodForDate,
  resolveTransactionPeriod,
} from '../../periods/period.util';
import { resolveOccurrenceDate } from '../occurrence.util';

@Injectable()
export class FixedExpensesService {
  constructor(
    private readonly fixedExpensesRepository: FixedExpensesRepository,
    private readonly salaryService: SalaryService,
    private readonly transactionsService: TransactionsService,
  ) {}

  create(userId: number, createFixedExpenseDto: CreateFixedExpenseDto) {
    return this.fixedExpensesRepository.create(userId, createFixedExpenseDto);
  }

  private async findOwnedOrThrow(id: number, userId: number) {
    const fixedExpense = await this.fixedExpensesRepository.findOneOwned(
      id,
      userId,
    );

    if (!fixedExpense) {
      throw new NotFoundException('Fixed expense not found');
    }

    return fixedExpense;
  }

  private async getPeriodContext(userId: number) {
    const [salaries, transactions] = await Promise.all([
      this.salaryService.findAllForUser(userId),
      this.transactionsService.findAllForUser(userId),
    ]);

    const payrollDates = salaries
      .filter((salary) => salary.type === IncomeType.Payroll)
      .map((salary) => salary.date);

    return { periods: computePeriods(payrollDates), transactions };
  }

  private findPaymentForOccurrence(
    transactions: Transaction[],
    periods: ComputedPeriod[],
    fixedExpenseId: number,
    occurrencePeriodIndex: number,
  ) {
    return transactions.find(
      (transaction) =>
        transaction.fixedExpenseId === fixedExpenseId &&
        resolveTransactionPeriod(
          periods,
          transaction.date,
          transaction.periodOverride,
        ).index === occurrencePeriodIndex,
    );
  }

  async findAllForUser(userId: number) {
    const [fixedExpenses, { periods, transactions }] = await Promise.all([
      this.fixedExpensesRepository.findManyByUser(userId),
      this.getPeriodContext(userId),
    ]);
    const today = new Date();

    return fixedExpenses.map((fixedExpense) => {
      const occurrencePeriod = resolvePeriodForDate(
        periods,
        resolveOccurrenceDate(fixedExpense.dueDate, today),
      );
      const paidThisCycle = Boolean(
        this.findPaymentForOccurrence(
          transactions,
          periods,
          fixedExpense.id,
          occurrencePeriod.index,
        ),
      );

      return { ...fixedExpense, paidThisCycle };
    });
  }

  async update(
    id: number,
    userId: number,
    updateFixedExpenseDto: UpdateFixedExpenseDto,
  ) {
    await this.findOwnedOrThrow(id, userId);
    return this.fixedExpensesRepository.update(id, updateFixedExpenseDto);
  }

  async remove(id: number, userId: number) {
    await this.findOwnedOrThrow(id, userId);
    return this.fixedExpensesRepository.delete(id);
  }

  async pay(id: number, userId: number) {
    const fixedExpense = await this.findOwnedOrThrow(id, userId);
    const { periods, transactions } = await this.getPeriodContext(userId);
    const occurrenceDate = resolveOccurrenceDate(
      fixedExpense.dueDate,
      new Date(),
    );
    const occurrencePeriod = resolvePeriodForDate(periods, occurrenceDate);

    const existing = this.findPaymentForOccurrence(
      transactions,
      periods,
      fixedExpense.id,
      occurrencePeriod.index,
    );

    if (existing) {
      throw new ConflictException({
        message: 'This fixed expense was already paid for the current cycle',
        transaction: existing,
      });
    }

    return this.transactionsService.create(userId, {
      amount: fixedExpense.amount,
      date: occurrenceDate,
      category: fixedExpense.budgetCategory,
      description: fixedExpense.name,
      fixedExpenseId: fixedExpense.id,
    });
  }
}
