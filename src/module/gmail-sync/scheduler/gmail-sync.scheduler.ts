import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GmailOAuthService } from 'src/module/gmail/services/gmail-oauth.service';
import { NotificationsService } from 'src/module/notifications/services/notifications.service';
import { GmailSyncOrchestrator } from '../services/gmail-sync-orchestrator.service';

/**
 * Only cron job in the app (hence why `@nestjs/schedule` — not Bull/Redis —
 * is enough: there's a single, idempotent, hourly job, no queueing/retries
 * infrastructure needed). Runs every hour on the hour.
 */
@Injectable()
export class GmailSyncScheduler {
  private readonly logger = new Logger(GmailSyncScheduler.name);

  constructor(
    private readonly gmailOAuthService: GmailOAuthService,
    private readonly orchestrator: GmailSyncOrchestrator,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 * * * *')
  async handleHourlySync(): Promise<void> {
    const connections =
      await this.gmailOAuthService.listConnectionsForAutoSync();

    for (const connection of connections) {
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
    }
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
