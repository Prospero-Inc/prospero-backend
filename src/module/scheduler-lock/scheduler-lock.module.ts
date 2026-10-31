import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SchedulerLockService } from './scheduler-lock.service';

@Module({
  providers: [SchedulerLockService, PrismaService],
  exports: [SchedulerLockService],
})
export class SchedulerLockModule {}
