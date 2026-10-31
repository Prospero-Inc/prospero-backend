import { RefreshTokenCleanupScheduler } from './refresh-token-cleanup.scheduler';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { SchedulerLockService } from '../scheduler-lock/scheduler-lock.service';

describe('RefreshTokenCleanupScheduler', () => {
  const deleteStale = jest.fn().mockResolvedValue(3);
  const scheduler = new RefreshTokenCleanupScheduler(
    { deleteStale } as unknown as RefreshTokenRepository,
    {
      runExclusive: (_name: string, _ttl: number, job: () => Promise<void>) =>
        job().then(() => true),
    } as unknown as SchedulerLockService,
  );

  it('deletes expired tokens and those revoked more than 30 days ago', async () => {
    const now = new Date('2026-11-01T03:30:00Z');

    await scheduler.cleanup(now);

    expect(deleteStale).toHaveBeenCalledWith(
      now,
      new Date('2026-10-02T03:30:00Z'),
    );
  });
});
