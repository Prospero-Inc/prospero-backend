import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { mapWithConcurrency } from 'src/lib/concurrency/map-with-concurrency';
import { NotificationsService } from 'src/module/notifications/services/notifications.service';
import { SchedulerLockService } from 'src/module/scheduler-lock/scheduler-lock.service';
import { resolveLocalDate } from '../occurrence.util';
import { FixedExpensesService } from '../services/fixed-expenses.service';

const REMINDER_TIME_ZONE = 'America/El_Salvador';
const REMINDER_CONCURRENCY = 5;
const REMINDER_LOCK_TTL_MS = 30 * 60 * 1000;

/**
 * Tells each user, on the morning a fixed expense is due, that it's still
 * unpaid. It only reminds: marking it as paid stays the user's call, since
 * the charge may not have happened.
 */
@Injectable()
export class FixedExpenseReminderScheduler {
  private readonly logger = new Logger(FixedExpenseReminderScheduler.name);

  constructor(
    private readonly fixedExpensesService: FixedExpensesService,
    private readonly notificationsService: NotificationsService,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  @Cron('0 6 * * *', { timeZone: REMINDER_TIME_ZONE })
  async handleDailyReminders(): Promise<void> {
    await this.schedulerLock.runExclusive(
      'fixed-expense-reminders',
      REMINDER_LOCK_TTL_MS,
      () => this.remindAll(),
    );
  }

  private async remindAll(): Promise<void> {
    const today = resolveLocalDate(new Date(), REMINDER_TIME_ZONE);
    const dueByUser = await this.fixedExpensesService.findRemindersDueOn(today);

    await mapWithConcurrency(
      [...dueByUser],
      REMINDER_CONCURRENCY,
      async ([userId, fixedExpenses]) => {
        try {
          const unpaid = await this.fixedExpensesService.filterUnpaid(
            userId,
            fixedExpenses,
            today,
          );
          if (unpaid.length > 0) {
            await this.notificationsService.notifyFixedExpensesDue(
              userId,
              today,
              unpaid,
            );
          }
        } catch (error) {
          // One user's failure must never abort the rest of the batch.
          const message =
            error instanceof Error ? error.message : 'unknown error';
          this.logger.error(
            `Fixed expense reminder failed for userId=${userId}: ${message}`,
          );
        }
      },
    );
  }
}
