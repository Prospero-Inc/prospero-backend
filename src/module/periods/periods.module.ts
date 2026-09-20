import { Module } from '@nestjs/common';
import { PeriodsController } from './periods.controller';
import { PeriodsService } from './periods.service';
import { UserModule } from '../user/user.module';
import { SalaryModule } from '../salary/salary.module';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({
  imports: [UserModule, SalaryModule, TransactionsModule],
  controllers: [PeriodsController],
  providers: [PeriodsService],
})
export class PeriodsModule {}
