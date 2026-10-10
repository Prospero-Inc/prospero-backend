import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { GmailModule } from '../gmail/gmail.module';
import { FinancialInstitutionsModule } from '../financial-institutions/financial-institutions.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { SalaryModule } from '../salary/salary.module';
import { PrismaService } from '../prisma.service';
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
 * connect/disconnect only) as planned. This is the only module in the app
 * registering a `@Cron` job, so `ScheduleModule.forRoot()` lives here rather
 * than in `AppModule`. Also owns `ProcessedEmailsController` (the "create
 * anyway" action on a `ProcessedEmail`) since it's the only consumer of
 * `ProcessedEmailRepository`.
 */
@Module({
  imports: [
    HttpModule,
    ScheduleModule.forRoot(),
    GmailModule,
    FinancialInstitutionsModule,
    TransactionsModule,
    SalaryModule,
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
