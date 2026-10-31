import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SchedulerLockModule } from '../scheduler-lock/scheduler-lock.module';
import { MoneyIntegrityScheduler } from './money-integrity.scheduler';

@Module({
  imports: [SchedulerLockModule],
  providers: [MoneyIntegrityScheduler, PrismaService],
})
export class MoneyModule {}
