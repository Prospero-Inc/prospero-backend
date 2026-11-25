import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FixedExpense, Transaction } from '@prisma/client';
import { FixedExpensesRepository } from '../repositories/fixed-expenses.repository';
import { CreateFixedExpenseDto } from '../dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from '../dto/update-fixed-expense.dto';
import { TransactionsService } from '../../transactions/services/transactions.service';
import {
  resolveOccurrenceDate,
  resolveReferenceDate,
} from '../occurrence.util';
import { utcMonthRange } from 'src/lib/dates/local-date';

/** Occurrences are always in `date`'s UTC month (see resolveOccurrenceDate),
 * so that month's payments are all a cycle check needs. */
function occurrenceMonth(date: Date) {
  return utcMonthRange(date.getUTCFullYear(), date.getUTCMonth());
}

@Injectable()
export class FixedExpensesService {
  constructor(
    private readonly fixedExpensesRepository: FixedExpensesRepository,
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

  /** A fixed expense's cycle is the calendar month of its occurrence, not a
   * payroll period: the last period is open-ended, so every future occurrence
   * falls in it, next to the payments already made in it. */
  private findPaymentForOccurrence<
    T extends Pick<Transaction, 'fixedExpenseId' | 'date'>,
  >(transactions: T[], fixedExpenseId: number, occurrenceDate: Date) {
    return transactions.find(
      (transaction) =>
        transaction.fixedExpenseId === fixedExpenseId &&
        transaction.date.getUTCFullYear() === occurrenceDate.getUTCFullYear() &&
        transaction.date.getUTCMonth() === occurrenceDate.getUTCMonth(),
    );
  }

  /** `localToday`: the user's date (YYYY-MM-DD), see resolveReferenceDate. */
  async findAllForUser(userId: number, localToday?: string) {
    const today = resolveReferenceDate(localToday, new Date());
    const { from, to } = occurrenceMonth(today);
    const [fixedExpenses, transactions] = await Promise.all([
      this.fixedExpensesRepository.findManyByUser(userId),
      this.transactionsService.findFixedExpensePayments(userId, from, to),
    ]);

    return fixedExpenses.map((fixedExpense) => {
      const paidThisCycle = Boolean(
        this.findPaymentForOccurrence(
          transactions,
          fixedExpense.id,
          resolveOccurrenceDate(fixedExpense.dueDate, today),
        ),
      );

      return { ...fixedExpense, paidThisCycle };
    });
  }

  /** Fixed expenses with a reminder whose occurrence is `today`, by user. */
  async findRemindersDueOn(today: Date) {
    const fixedExpenses =
      await this.fixedExpensesRepository.findManyWithReminder();
    const dueByUser = new Map<number, FixedExpense[]>();

    for (const fixedExpense of fixedExpenses) {
      const occurrence = resolveOccurrenceDate(fixedExpense.dueDate, today);
      if (occurrence.getTime() !== today.getTime()) continue;
      dueByUser.set(fixedExpense.userId, [
        ...(dueByUser.get(fixedExpense.userId) ?? []),
        fixedExpense,
      ]);
    }

    return dueByUser;
  }

  /** Of a user's `fixedExpenses`, those not paid in `date`'s month. */
  async filterUnpaid(
    userId: number,
    fixedExpenses: FixedExpense[],
    date: Date,
  ) {
    const { from, to } = occurrenceMonth(date);
    const transactions =
      await this.transactionsService.findFixedExpensePayments(userId, from, to);
    return fixedExpenses.filter(
      ({ id }) => !this.findPaymentForOccurrence(transactions, id, date),
    );
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

  async pay(id: number, userId: number, localToday?: string) {
    const fixedExpense = await this.findOwnedOrThrow(id, userId);
    const occurrenceDate = resolveOccurrenceDate(
      fixedExpense.dueDate,
      resolveReferenceDate(localToday, new Date()),
    );
    // Full rows (not findFixedExpensePayments): the 409 body returns the
    // existing payment as-is.
    const transactions = await this.transactionsService.findAllForUser(
      userId,
      occurrenceMonth(occurrenceDate),
    );

    const existing = this.findPaymentForOccurrence(
      transactions,
      fixedExpense.id,
      occurrenceDate,
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
