import { Module } from '@nestjs/common';
import { FixedExpensesController } from './controllers/fixed-expenses.controller';
import { FixedExpensesService } from './services/fixed-expenses.service';
import { FixedExpensesRepository } from './repositories/fixed-expenses.repository';
import { PrismaService } from '../prisma.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulerLockModule } from '../scheduler-lock/scheduler-lock.module';
import { FixedExpenseReminderScheduler } from './scheduler/fixed-expense-reminder.scheduler';

@Module({
  imports: [TransactionsModule, NotificationsModule, SchedulerLockModule],
  controllers: [FixedExpensesController],
  providers: [
    FixedExpensesService,
    FixedExpensesRepository,
    FixedExpenseReminderScheduler,
    PrismaService,
  ],
  exports: [FixedExpensesService],
})
export class FixedExpensesModule {}
