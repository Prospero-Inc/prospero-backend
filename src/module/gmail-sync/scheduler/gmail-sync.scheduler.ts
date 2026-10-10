import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GmailOAuthService } from 'src/module/gmail/services/gmail-oauth.service';
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
  ) {}

  @Cron('0 * * * *')
  async handleHourlySync(): Promise<void> {
    const connections =
      await this.gmailOAuthService.listConnectionsForAutoSync();

    for (const connection of connections) {
      try {
        await this.orchestrator.syncConnection(connection);
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
}
