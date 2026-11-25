import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/module/prisma.service';
import { SchedulerLockService } from '../src/module/scheduler-lock/scheduler-lock.service';
import { GmailOAuthService } from '../src/module/gmail/services/gmail-oauth.service';
import { FinancialInstitutionsService } from '../src/module/financial-institutions/services/financial-institutions.service';
import { MerchantRulesService } from '../src/module/merchant-rules/services/merchant-rules.service';
import { TransactionsRepository } from '../src/module/transactions/repositories/transactions.repository';
import { TransactionsService } from '../src/module/transactions/services/transactions.service';
import { GmailApiClient } from '../src/module/gmail-sync/services/gmail-api-client.service';
import { DuplicateDetectorService } from '../src/module/gmail-sync/services/duplicate-detector.service';
import { GmailSyncOrchestrator } from '../src/module/gmail-sync/services/gmail-sync-orchestrator.service';
import { ProcessedEmailRepository } from '../src/module/gmail-sync/repositories/processed-email.repository';

/** A Banco Agrícola recarga confirmation, as the Gmail API returns it. */
const recargaMessage = (id: string, internalDate: Date) => {
  const body = [
    'Por este medio deseamos informarte que se ha aplicado satisfactoriamente tu transacción: Recarga de Celular.',
    'Datos de la operación:',
    'ID: 999',
    'Fecha y hora: 07/10/2026 17:23:44',
    'Compañía: CLARO, PREPAGO (RECARGA)',
    'Paquete: Pack Datos Ilimitados 1D $1.50 $ 1.50',
  ].join('\n');
  return {
    id,
    threadId: id,
    internalDate: String(internalDate.getTime()),
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: 'Banco Agrícola <alertas@bancoagricola.com>' },
      ],
      body: { data: Buffer.from(body, 'utf-8').toString('base64url') },
    },
  };
};

/**
 * plan-rendimiento B5/B6: the Gmail pipeline against the real Postgres,
 * Gmail itself mocked. Same database setup as auth-flows.
 */
describe('Gmail sync (Postgres)', () => {
  let prisma: PrismaService;
  let userId: number;
  let institutionId: number;
  let gmail: { listMessageIds: jest.Mock; getMessage: jest.Mock };

  const build = async (lock?: Partial<SchedulerLockService>) => {
    gmail = {
      listMessageIds: jest.fn(),
      getMessage: jest.fn(),
    };
    const builder = Test.createTestingModule({
      providers: [
        GmailSyncOrchestrator,
        ProcessedEmailRepository,
        DuplicateDetectorService,
        TransactionsService,
        TransactionsRepository,
        SchedulerLockService,
        { provide: PrismaService, useValue: prisma },
        { provide: GmailApiClient, useValue: gmail },
        { provide: MerchantRulesService, useValue: {} },
        {
          provide: GmailOAuthService,
          useValue: {
            getValidAccessToken: jest.fn().mockResolvedValue('token'),
            markSynced: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FinancialInstitutionsService,
          useValue: {
            findActiveSendersForUser: jest.fn().mockResolvedValue([
              {
                emailAddress: 'alertas@bancoagricola.com',
                institution: { id: institutionId, parserKey: 'banco_agricola' },
              },
            ]),
          },
        },
      ],
    });
    if (lock) builder.overrideProvider(SchedulerLockService).useValue(lock);
    const moduleRef = await builder.compile();
    return moduleRef.get(GmailSyncOrchestrator);
  };

  const connection = (lastSyncAt: Date | null = null) =>
    ({ id: 1, userId, lastSyncAt }) as any;

  const gmailRows = (messageId: string) =>
    prisma.transaction.findMany({
      where: { userId, gmailMessageId: messageId },
    });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = Date.now();
    const user = await prisma.user.create({
      data: { email: `gmail-${stamp}@example.com`, username: `gmail-${stamp}` },
    });
    userId = user.id;
    const institution = await prisma.financialInstitution.create({
      data: { userId, name: 'Banco Agrícola', parserKey: 'banco_agricola' },
    });
    institutionId = institution.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  /** Slow enough that two runs overlap between "already processed?" and the
   * insert, like the hourly cron and a sync-now hitting the same email. */
  const serveSlowly = (message: ReturnType<typeof recargaMessage>) => {
    gmail.listMessageIds.mockResolvedValue([{ id: message.id }]);
    gmail.getMessage.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(message), 50)),
    );
  };

  it('creates one expense when two syncs of the same user overlap', async () => {
    const orchestrator = await build();
    const message = recargaMessage(`race-lock-${Date.now()}`, new Date());
    serveSlowly(message);

    await Promise.all([
      orchestrator.syncConnection(connection()),
      orchestrator.syncConnection(connection()),
    ]);

    expect(await gmailRows(message.id)).toHaveLength(1);
  });

  it('creates one expense even without the per-user lock (transaction + unique)', async () => {
    const passThrough = {
      runExclusive: async (
        _n: string,
        _t: number,
        job: () => Promise<void>,
      ) => {
        await job();
        return true;
      },
    };
    const orchestrator = await build(passThrough);
    const message = recargaMessage(`race-tx-${Date.now()}`, new Date());
    serveSlowly(message);

    await Promise.all([
      orchestrator.syncConnection(connection()),
      orchestrator.syncConnection(connection()),
    ]);

    const rows = await gmailRows(message.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(150);
    const audit = await prisma.processedEmail.findMany({
      where: { userId, gmailMessageId: message.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].relatedTransactionId).toBe(rows[0].id);
  });

  it('processes a never-seen email Gmail indexed after the last sync', async () => {
    const orchestrator = await build();
    const lastSyncAt = new Date();
    // Delivered an hour before the last sync, but only listed now.
    const message = recargaMessage(
      `late-${Date.now()}`,
      new Date(lastSyncAt.getTime() - 60 * 60 * 1000),
    );
    gmail.listMessageIds.mockResolvedValue([{ id: message.id }]);
    gmail.getMessage.mockResolvedValue(message);

    const { transactionsCreated } = await orchestrator.syncConnection(
      connection(lastSyncAt),
    );

    expect(transactionsCreated).toBe(1);
    expect(await gmailRows(message.id)).toHaveLength(1);
  });
});
