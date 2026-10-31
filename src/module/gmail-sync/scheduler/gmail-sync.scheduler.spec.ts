import { Test, TestingModule } from '@nestjs/testing';
import { GmailSyncScheduler } from './gmail-sync.scheduler';
import { GmailOAuthService } from 'src/module/gmail/services/gmail-oauth.service';
import { NotificationsService } from 'src/module/notifications/services/notifications.service';
import { GmailSyncOrchestrator } from '../services/gmail-sync-orchestrator.service';
import { SchedulerLockService } from 'src/module/scheduler-lock/scheduler-lock.service';

describe('GmailSyncScheduler', () => {
  let scheduler: GmailSyncScheduler;
  let gmailOAuthService: { listConnectionsForAutoSync: jest.Mock };
  let orchestrator: { syncConnection: jest.Mock };
  let notificationsService: { notifyGmailReviewPending: jest.Mock };
  let schedulerLock: { runExclusive: jest.Mock };

  beforeEach(async () => {
    gmailOAuthService = { listConnectionsForAutoSync: jest.fn() };
    orchestrator = { syncConnection: jest.fn() };
    notificationsService = {
      notifyGmailReviewPending: jest.fn().mockResolvedValue(undefined),
    };
    // Lock free by default: run the job.
    schedulerLock = {
      runExclusive: jest.fn((_name, _ttl, job: () => Promise<void>) =>
        job().then(() => true),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailSyncScheduler,
        { provide: GmailOAuthService, useValue: gmailOAuthService },
        { provide: GmailSyncOrchestrator, useValue: orchestrator },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: SchedulerLockService, useValue: schedulerLock },
      ],
    }).compile();

    scheduler = module.get<GmailSyncScheduler>(GmailSyncScheduler);
  });

  it('syncs every connected, auto-detect-enabled connection', async () => {
    const connections = [{ userId: 1 }, { userId: 2 }];
    gmailOAuthService.listConnectionsForAutoSync.mockResolvedValue(connections);
    orchestrator.syncConnection.mockResolvedValue({ transactionsCreated: 0 });

    await scheduler.handleHourlySync();

    expect(orchestrator.syncConnection).toHaveBeenCalledTimes(2);
    expect(orchestrator.syncConnection).toHaveBeenCalledWith(connections[0]);
    expect(orchestrator.syncConnection).toHaveBeenCalledWith(connections[1]);
  });

  it('does not sync anything when another process holds the lock', async () => {
    schedulerLock.runExclusive.mockResolvedValue(false);

    await scheduler.handleHourlySync();

    expect(schedulerLock.runExclusive).toHaveBeenCalledWith(
      'gmail-sync',
      expect.any(Number),
      expect.any(Function),
    );
    expect(gmailOAuthService.listConnectionsForAutoSync).not.toHaveBeenCalled();
  });

  it('one user failing (e.g. revoked token) does not abort the rest of the batch', async () => {
    const connections = [{ userId: 1 }, { userId: 2 }, { userId: 3 }];
    gmailOAuthService.listConnectionsForAutoSync.mockResolvedValue(connections);
    orchestrator.syncConnection
      .mockRejectedValueOnce(new Error('token revoked'))
      .mockResolvedValueOnce({ transactionsCreated: 0 })
      .mockResolvedValueOnce({ transactionsCreated: 0 });

    await expect(scheduler.handleHourlySync()).resolves.toBeUndefined();

    expect(orchestrator.syncConnection).toHaveBeenCalledTimes(3);
  });

  it('notifies the user when a sync pass creates new pending-review transactions', async () => {
    const connections = [{ userId: 1 }];
    gmailOAuthService.listConnectionsForAutoSync.mockResolvedValue(connections);
    orchestrator.syncConnection.mockResolvedValue({ transactionsCreated: 3 });

    await scheduler.handleHourlySync();

    expect(notificationsService.notifyGmailReviewPending).toHaveBeenCalledWith(
      1,
      3,
    );
  });

  it('does not notify when a sync pass creates no new transactions', async () => {
    const connections = [{ userId: 1 }];
    gmailOAuthService.listConnectionsForAutoSync.mockResolvedValue(connections);
    orchestrator.syncConnection.mockResolvedValue({ transactionsCreated: 0 });

    await scheduler.handleHourlySync();

    expect(
      notificationsService.notifyGmailReviewPending,
    ).not.toHaveBeenCalled();
  });

  it('a notification-dispatch failure for one user does not abort the rest of the batch', async () => {
    const connections = [{ userId: 1 }, { userId: 2 }];
    gmailOAuthService.listConnectionsForAutoSync.mockResolvedValue(connections);
    orchestrator.syncConnection.mockResolvedValue({ transactionsCreated: 1 });
    notificationsService.notifyGmailReviewPending
      .mockRejectedValueOnce(new Error('smtp down'))
      .mockResolvedValueOnce(undefined);

    await expect(scheduler.handleHourlySync()).resolves.toBeUndefined();

    expect(orchestrator.syncConnection).toHaveBeenCalledTimes(2);
    expect(notificationsService.notifyGmailReviewPending).toHaveBeenCalledTimes(
      2,
    );
  });
});
