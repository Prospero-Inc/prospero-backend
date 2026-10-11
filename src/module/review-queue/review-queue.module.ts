import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { SalaryModule } from '../salary/salary.module';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewQueueService } from './review-queue.service';

/**
 * Small composition module for the review-queue nav badge — intentionally
 * separate from `gmail-sync` (OAuth/sync-pipeline internals) since this is
 * just a read-side aggregate over `Transaction`/`Salary` rows the pipeline
 * already created; it has no dependency on Gmail-specific services.
 */
@Module({
  imports: [TransactionsModule, SalaryModule],
  controllers: [ReviewQueueController],
  providers: [ReviewQueueService],
})
export class ReviewQueueModule {}
