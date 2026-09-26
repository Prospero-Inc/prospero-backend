import { Module } from '@nestjs/common';
import { FixedExpensesController } from './controllers/fixed-expenses.controller';
import { FixedExpensesService } from './services/fixed-expenses.service';
import { FixedExpensesRepository } from './repositories/fixed-expenses.repository';
import { PrismaService } from '../prisma.service';
import { SalaryModule } from '../salary/salary.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [SalaryModule, TransactionsModule],
  controllers: [FixedExpensesController],
  providers: [FixedExpensesService, FixedExpensesRepository, PrismaService],
  exports: [FixedExpensesService],
})
export class FixedExpensesModule {}
