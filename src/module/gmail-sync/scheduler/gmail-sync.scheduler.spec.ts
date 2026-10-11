import { Test, TestingModule } from '@nestjs/testing';
import { GmailSyncScheduler } from './gmail-sync.scheduler';
import { GmailOAuthService } from 'src/module/gmail/services/gmail-oauth.service';
import { GmailSyncOrchestrator } from '../services/gmail-sync-orchestrator.service';

describe('GmailSyncScheduler', () => {
  let scheduler: GmailSyncScheduler;
  let gmailOAuthService: { listConnectionsForAutoSync: jest.Mock };
  let orchestrator: { syncConnection: jest.Mock };

  beforeEach(async () => {
    gmailOAuthService = { listConnectionsForAutoSync: jest.fn() };
    orchestrator = { syncConnection: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailSyncScheduler,
        { provide: GmailOAuthService, useValue: gmailOAuthService },
        { provide: GmailSyncOrchestrator, useValue: orchestrator },
      ],
    }).compile();

    scheduler = module.get<GmailSyncScheduler>(GmailSyncScheduler);
  });

  it('syncs every connected, auto-detect-enabled connection', async () => {
    const connections = [{ userId: 1 }, { userId: 2 }];
    gmailOAuthService.listConnectionsForAutoSync.mockResolvedValue(connections);
    orchestrator.syncConnection.mockResolvedValue(undefined);

    await scheduler.handleHourlySync();

    expect(orchestrator.syncConnection).toHaveBeenCalledTimes(2);
    expect(orchestrator.syncConnection).toHaveBeenCalledWith(connections[0]);
    expect(orchestrator.syncConnection).toHaveBeenCalledWith(connections[1]);
  });

  it('one user failing (e.g. revoked token) does not abort the rest of the batch', async () => {
    const connections = [{ userId: 1 }, { userId: 2 }, { userId: 3 }];
    gmailOAuthService.listConnectionsForAutoSync.mockResolvedValue(connections);
    orchestrator.syncConnection
      .mockRejectedValueOnce(new Error('token revoked'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(scheduler.handleHourlySync()).resolves.toBeUndefined();

    expect(orchestrator.syncConnection).toHaveBeenCalledTimes(3);
  });
});
