import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SchedulerLockService } from '../scheduler-lock/scheduler-lock.service';
import { REVOKED_REFRESH_TOKEN_RETENTION_DAYS } from './auth.constants';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Keeps `refresh_tokens` from growing forever (one row per login/refresh). */
@Injectable()
export class RefreshTokenCleanupScheduler {
  private readonly logger = new Logger(RefreshTokenCleanupScheduler.name);

  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  @Cron('30 3 * * *')
  async handleDailyCleanup(): Promise<void> {
    await this.schedulerLock.runExclusive(
      'refresh-token-cleanup',
      10 * 60 * 1000,
      () => this.cleanup(new Date()),
    );
  }

  async cleanup(now: Date): Promise<void> {
    const revokedBefore = new Date(
      now.getTime() - REVOKED_REFRESH_TOKEN_RETENTION_DAYS * DAY_MS,
    );
    const deleted = await this.refreshTokenRepository.deleteStale(
      now,
      revokedBefore,
    );
    this.logger.log(`Deleted ${deleted} stale refresh token(s)`);
  }
}
