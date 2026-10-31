import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GmailOAuthService } from 'src/module/gmail/services/gmail-oauth.service';
import { NotificationsService } from 'src/module/notifications/services/notifications.service';
import { SchedulerLockService } from 'src/module/scheduler-lock/scheduler-lock.service';
import { mapWithConcurrency } from 'src/lib/concurrency/map-with-concurrency';
import { GmailSyncOrchestrator } from '../services/gmail-sync-orchestrator.service';
import {
  GMAIL_SYNC_CONCURRENCY,
  GMAIL_SYNC_LOCK_TTL_MS,
} from '../gmail-sync.constants';

/**
 * Hourly Gmail sync (`@nestjs/schedule` — not Bull/Redis — is enough: an
 * idempotent job, no queueing/retries infrastructure needed). Guarded by a
 * DB lease so only one process runs it (e.g. while containers overlap during
 * a deploy), and syncs a few accounts in parallel instead of one by one.
 */
@Injectable()
export class GmailSyncScheduler {
  private readonly logger = new Logger(GmailSyncScheduler.name);

  constructor(
    private readonly gmailOAuthService: GmailOAuthService,
    private readonly orchestrator: GmailSyncOrchestrator,
    private readonly notificationsService: NotificationsService,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  @Cron('0 * * * *')
  async handleHourlySync(): Promise<void> {
    await this.schedulerLock.runExclusive(
      'gmail-sync',
      GMAIL_SYNC_LOCK_TTL_MS,
      () => this.syncAll(),
    );
  }

  private async syncAll(): Promise<void> {
    const connections =
      await this.gmailOAuthService.listConnectionsForAutoSync();

    await mapWithConcurrency(
      connections,
      GMAIL_SYNC_CONCURRENCY,
      async (connection) => {
        try {
          const { transactionsCreated } =
            await this.orchestrator.syncConnection(connection);
          if (transactionsCreated > 0) {
            await this.notifyReviewPending(
              connection.userId,
              transactionsCreated,
            );
          }
        } catch (error) {
          // One user's failure (revoked token, Gmail rate limit, transient
          // network error) must never abort the rest of the batch.
          const message =
            error instanceof Error ? error.message : 'unknown error';
          this.logger.error(
            `Gmail sync failed for userId=${connection.userId}: ${message}`,
          );
        }
      },
    );
  }

  /** Isolated from the sync try/catch above so a notification-delivery
   * failure is logged with its own, accurate message rather than being
   * reported as a sync failure it isn't. `NotificationsService` already
   * swallows per-provider errors internally; this guards against the
   * (rarer) case of the dispatch itself throwing, e.g. the user lookup. */
  private async notifyReviewPending(
    userId: number,
    transactionsCreated: number,
  ): Promise<void> {
    try {
      await this.notificationsService.notifyGmailReviewPending(
        userId,
        transactionsCreated,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Failed to notify userId=${userId} about ${transactionsCreated} pending-review transaction(s): ${message}`,
      );
    }
  }
}
