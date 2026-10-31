import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GmailModule } from '../gmail/gmail.module';
import { FinancialInstitutionsModule } from '../financial-institutions/financial-institutions.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { SalaryModule } from '../salary/salary.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma.service';
import { SchedulerLockModule } from '../scheduler-lock/scheduler-lock.module';
import { GmailApiClient } from './services/gmail-api-client.service';
import { DuplicateDetectorService } from './services/duplicate-detector.service';
import { GmailSyncOrchestrator } from './services/gmail-sync-orchestrator.service';
import { ProcessedEmailsService } from './services/processed-emails.service';
import { ProcessedEmailRepository } from './repositories/processed-email.repository';
import { GmailSyncScheduler } from './scheduler/gmail-sync.scheduler';
import { ProcessedEmailsController } from './controllers/processed-emails.controller';
import { GmailSyncController } from './controllers/gmail-sync.controller';

/**
 * Phase 3's sync/parsing pipeline — kept separate from `GmailModule` (OAuth
 * connect/disconnect only) as planned. Its hourly `@Cron` job takes a DB
 * lease through `SchedulerLockModule`. Also owns `ProcessedEmailsController` (the "create
 * anyway" action on a `ProcessedEmail`) since it's the only consumer of
 * `ProcessedEmailRepository`. Imports `NotificationsModule` so
 * `GmailSyncScheduler` can notify a user once a sync pass creates new
 * `PendingReview` transactions — see `NotificationsService.
 * notifyGmailReviewPending`.
 */
@Module({
  imports: [
    HttpModule,
    SchedulerLockModule,
    GmailModule,
    FinancialInstitutionsModule,
    TransactionsModule,
    SalaryModule,
    NotificationsModule,
  ],
  controllers: [ProcessedEmailsController, GmailSyncController],
  providers: [
    PrismaService,
    GmailApiClient,
    DuplicateDetectorService,
    ProcessedEmailRepository,
    GmailSyncOrchestrator,
    ProcessedEmailsService,
    GmailSyncScheduler,
  ],
})
export class GmailSyncModule {}
