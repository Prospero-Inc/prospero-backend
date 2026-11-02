import { BudgetCategory } from '@prisma/client';
import { FixedExpenseReminderScheduler } from './fixed-expense-reminder.scheduler';
import { FixedExpensesService } from '../services/fixed-expenses.service';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const fixedExpense = (id: number, userId: number, dueDate: string) => ({
  id,
  userId,
  amount: 15,
  name: `Gasto ${id}`,
  budgetCategory: BudgetCategory.Deseo,
  dueDate: d(dueDate),
  reminder: true,
  description: null,
});

describe('FixedExpenseReminderScheduler', () => {
  let repository: { findManyWithReminder: jest.Mock };
  let transactionsService: { findAllForUser: jest.Mock };
  let notificationsService: { notifyFixedExpensesDue: jest.Mock };
  let schedulerLock: { runExclusive: jest.Mock };
  let scheduler: FixedExpenseReminderScheduler;

  // 6:00 a. m. in El Salvador (UTC-6).
  const setToday = (date: string) =>
    jest.setSystemTime(new Date(`${date}T12:00:00.000Z`));

  beforeEach(() => {
    jest.useFakeTimers();
    repository = { findManyWithReminder: jest.fn().mockResolvedValue([]) };
    transactionsService = { findAllForUser: jest.fn().mockResolvedValue([]) };
    notificationsService = {
      notifyFixedExpensesDue: jest.fn().mockResolvedValue(undefined),
    };
    schedulerLock = {
      runExclusive: jest.fn((_name, _ttl, job) => job()),
    };
    scheduler = new FixedExpenseReminderScheduler(
      new FixedExpensesService(repository as any, transactionsService as any),
      notificationsService as any,
      schedulerLock as any,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reminds on the day it is due, not before', async () => {
    const due = fixedExpense(1, 5, '2024-01-30');
    repository.findManyWithReminder.mockResolvedValue([due]);

    setToday('2026-11-29');
    await scheduler.handleDailyReminders();
    expect(notificationsService.notifyFixedExpensesDue).not.toHaveBeenCalled();

    setToday('2026-11-30');
    await scheduler.handleDailyReminders();
    expect(notificationsService.notifyFixedExpensesDue).toHaveBeenCalledWith(
      5,
      d('2026-11-30'),
      [due],
    );
  });

  it('treats a bill due the 31st as due on the last day of a shorter month', async () => {
    const due = fixedExpense(1, 5, '2024-01-31');
    repository.findManyWithReminder.mockResolvedValue([due]);
    setToday('2026-11-30');

    await scheduler.handleDailyReminders();

    expect(notificationsService.notifyFixedExpensesDue).toHaveBeenCalledWith(
      5,
      d('2026-11-30'),
      [due],
    );
  });

  it('skips what is already paid this month, but not by last month', async () => {
    const paid = fixedExpense(1, 5, '2024-01-30');
    const unpaid = fixedExpense(2, 5, '2024-01-30');
    repository.findManyWithReminder.mockResolvedValue([paid, unpaid]);
    transactionsService.findAllForUser.mockResolvedValue([
      { fixedExpenseId: 1, date: d('2026-11-30') },
      { fixedExpenseId: 2, date: d('2026-10-30') },
    ]);
    setToday('2026-11-30');

    await scheduler.handleDailyReminders();

    expect(notificationsService.notifyFixedExpensesDue).toHaveBeenCalledWith(
      5,
      d('2026-11-30'),
      [unpaid],
    );
  });

  it('sends nothing when everything due is paid', async () => {
    repository.findManyWithReminder.mockResolvedValue([
      fixedExpense(1, 5, '2024-01-30'),
    ]);
    transactionsService.findAllForUser.mockResolvedValue([
      { fixedExpenseId: 1, date: d('2026-11-30') },
    ]);
    setToday('2026-11-30');

    await scheduler.handleDailyReminders();

    expect(notificationsService.notifyFixedExpensesDue).not.toHaveBeenCalled();
  });

  it("groups by user, and one user's failure doesn't stop the others", async () => {
    const first = fixedExpense(1, 5, '2024-01-30');
    const second = fixedExpense(2, 5, '2024-01-30');
    const other = fixedExpense(3, 6, '2024-01-30');
    repository.findManyWithReminder.mockResolvedValue([first, second, other]);
    notificationsService.notifyFixedExpensesDue.mockRejectedValueOnce(
      new Error('boom'),
    );
    setToday('2026-11-30');

    await expect(scheduler.handleDailyReminders()).resolves.toBeUndefined();

    expect(notificationsService.notifyFixedExpensesDue).toHaveBeenCalledWith(
      5,
      d('2026-11-30'),
      [first, second],
    );
    expect(notificationsService.notifyFixedExpensesDue).toHaveBeenCalledWith(
      6,
      d('2026-11-30'),
      [other],
    );
  });

  it("uses El Salvador's date, not the server's UTC one", async () => {
    const due = fixedExpense(1, 5, '2024-01-30');
    repository.findManyWithReminder.mockResolvedValue([due]);
    // Evening of Nov 29 in UTC-6 is already Nov 30 in UTC.
    jest.setSystemTime(new Date('2026-11-30T02:00:00.000Z'));

    await scheduler.handleDailyReminders();

    expect(notificationsService.notifyFixedExpensesDue).not.toHaveBeenCalled();
  });

  it('runs under the scheduler lock', async () => {
    schedulerLock.runExclusive.mockResolvedValue(false);

    await scheduler.handleDailyReminders();

    expect(repository.findManyWithReminder).not.toHaveBeenCalled();
  });
});
