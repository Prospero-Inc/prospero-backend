import { Test, TestingModule } from '@nestjs/testing';
import { ProcessedEmailResult } from '@prisma/client';
import { GmailSyncOrchestrator } from './gmail-sync-orchestrator.service';
import { GmailApiClient } from './gmail-api-client.service';
import { DuplicateDetectorService } from './duplicate-detector.service';
import { ProcessedEmailRepository } from '../repositories/processed-email.repository';
import { GmailOAuthService } from 'src/module/gmail/services/gmail-oauth.service';
import { FinancialInstitutionsService } from 'src/module/financial-institutions/services/financial-institutions.service';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';

const AGRICOLA_SENDER = {
  id: 1,
  institutionId: 10,
  emailAddress: 'alertas@bancoagricola.com',
  institution: { id: 10, parserKey: 'banco_agricola', name: 'Banco Agrícola' },
};

function buildRecargaMessage(overrides: Partial<{ messageId: string }> = {}) {
  const bodyText = [
    'Por este medio deseamos informarte que se ha aplicado satisfactoriamente tu transacción: Recarga de Celular.',
    'Datos de la operación:',
    'ID: 999',
    'Fecha y hora: 07/10/2026 17:23:44',
    'Compañía: CLARO, PREPAGO (RECARGA)',
    'Paquete: Pack Datos Ilimitados 1D $1.50 $ 1.50',
  ].join('\n');

  const encoded = Buffer.from(bodyText, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return {
    id: overrides.messageId ?? 'msg-1',
    threadId: 'thread-1',
    internalDate: String(new Date('2026-10-07T17:23:44.000Z').getTime()),
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: 'Banco Agrícola <alertas@bancoagricola.com>' },
      ],
      body: { data: encoded },
    },
  };
}

describe('GmailSyncOrchestrator', () => {
  let orchestrator: GmailSyncOrchestrator;
  let gmailApiClient: { listMessageIds: jest.Mock; getMessage: jest.Mock };
  let gmailOAuthService: {
    getValidAccessToken: jest.Mock;
    markSynced: jest.Mock;
  };
  let financialInstitutionsService: { findActiveSendersForUser: jest.Mock };
  let processedEmailRepository: {
    findByUserAndMessage: jest.Mock;
    create: jest.Mock;
  };
  let duplicateDetector: { findManualDuplicate: jest.Mock };
  let transactionsService: { createFromGmail: jest.Mock };

  const connection = {
    id: 1,
    userId: 7,
    lastSyncAt: null,
  } as any;

  beforeEach(async () => {
    gmailApiClient = { listMessageIds: jest.fn(), getMessage: jest.fn() };
    gmailOAuthService = {
      getValidAccessToken: jest.fn().mockResolvedValue('access-token'),
      markSynced: jest.fn().mockResolvedValue(undefined),
    };
    financialInstitutionsService = {
      findActiveSendersForUser: jest.fn().mockResolvedValue([AGRICOLA_SENDER]),
    };
    processedEmailRepository = {
      findByUserAndMessage: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 1 }),
    };
    duplicateDetector = {
      findManualDuplicate: jest.fn().mockResolvedValue(null),
    };
    transactionsService = {
      createFromGmail: jest.fn().mockResolvedValue({ id: 100 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GmailSyncOrchestrator,
        { provide: GmailApiClient, useValue: gmailApiClient },
        { provide: GmailOAuthService, useValue: gmailOAuthService },
        {
          provide: FinancialInstitutionsService,
          useValue: financialInstitutionsService,
        },
        {
          provide: ProcessedEmailRepository,
          useValue: processedEmailRepository,
        },
        { provide: DuplicateDetectorService, useValue: duplicateDetector },
        { provide: TransactionsService, useValue: transactionsService },
      ],
    }).compile();

    orchestrator = module.get<GmailSyncOrchestrator>(GmailSyncOrchestrator);
  });

  it('a brand new recarga email creates a transaction and records Created', async () => {
    gmailApiClient.listMessageIds.mockResolvedValue([{ id: 'msg-1' }]);
    gmailApiClient.getMessage.mockResolvedValue(buildRecargaMessage());

    await orchestrator.syncConnection(connection);

    expect(transactionsService.createFromGmail).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        amount: 1.5,
        institutionId: 10,
        gmailMessageId: 'msg-1',
      }),
    );
    expect(processedEmailRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        gmailMessageId: 'msg-1',
        result: ProcessedEmailResult.Created,
        relatedTransactionId: 100,
      }),
    );
    expect(gmailOAuthService.markSynced).toHaveBeenCalledWith(
      7,
      expect.any(Date),
    );
  });

  it('a recarga that matches an existing manual transaction is PossibleDuplicate and creates nothing', async () => {
    gmailApiClient.listMessageIds.mockResolvedValue([{ id: 'msg-1' }]);
    gmailApiClient.getMessage.mockResolvedValue(buildRecargaMessage());
    duplicateDetector.findManualDuplicate.mockResolvedValue({ id: 555 });

    await orchestrator.syncConnection(connection);

    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
    expect(processedEmailRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result: ProcessedEmailResult.PossibleDuplicate,
        relatedTransactionId: 555,
      }),
    );
  });

  it('an unmapped transaction type is NeedsReview and creates nothing', async () => {
    const message = buildRecargaMessage();
    const unmappedBody = [
      'Por este medio deseamos informarte que se ha aplicado satisfactoriamente tu transacción: Transferencia.',
      'Datos de la operación:',
      'ID: 1',
      'Fecha y hora: 07/10/2026 17:23:44',
      'Monto: $ 25.00',
    ].join('\n');
    message.payload.body.data = Buffer.from(unmappedBody, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    gmailApiClient.listMessageIds.mockResolvedValue([{ id: 'msg-1' }]);
    gmailApiClient.getMessage.mockResolvedValue(message);

    await orchestrator.syncConnection(connection);

    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
    expect(processedEmailRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result: ProcessedEmailResult.NeedsReview,
        reason: expect.stringContaining('Transferencia'),
      }),
    );
  });

  it('an email from an unconfigured sender is Ignored and creates nothing', async () => {
    const message = buildRecargaMessage();
    message.payload.headers = [
      { name: 'From', value: 'Otro Banco <alertas@otrobanco.com>' },
    ];

    gmailApiClient.listMessageIds.mockResolvedValue([{ id: 'msg-1' }]);
    gmailApiClient.getMessage.mockResolvedValue(message);

    await orchestrator.syncConnection(connection);

    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
    expect(processedEmailRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        result: ProcessedEmailResult.Ignored,
        reason: 'remitente no configurado',
        senderEmail: 'alertas@otrobanco.com',
      }),
    );
  });

  it('a message that was already processed (same gmailMessageId) is skipped entirely — no second transaction', async () => {
    gmailApiClient.listMessageIds.mockResolvedValue([{ id: 'msg-1' }]);
    processedEmailRepository.findByUserAndMessage.mockResolvedValue({
      id: 1,
      userId: 7,
      gmailMessageId: 'msg-1',
      result: ProcessedEmailResult.Created,
    });

    await orchestrator.syncConnection(connection);

    expect(gmailApiClient.getMessage).not.toHaveBeenCalled();
    expect(transactionsService.createFromGmail).not.toHaveBeenCalled();
    expect(processedEmailRepository.create).not.toHaveBeenCalled();
  });

  it('skips the whole user without throwing when there are no active senders configured', async () => {
    financialInstitutionsService.findActiveSendersForUser.mockResolvedValue([]);

    await orchestrator.syncConnection(connection);

    expect(gmailApiClient.listMessageIds).not.toHaveBeenCalled();
    expect(gmailOAuthService.markSynced).toHaveBeenCalledWith(
      7,
      expect.any(Date),
    );
  });
});
