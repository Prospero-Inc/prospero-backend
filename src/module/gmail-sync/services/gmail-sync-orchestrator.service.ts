import { Injectable, Logger } from '@nestjs/common';
import {
  FinancialInstitution,
  GmailConnection,
  InstitutionSender,
  ProcessedEmailResult,
} from '@prisma/client';
import { GmailOAuthService } from 'src/module/gmail/services/gmail-oauth.service';
import { FinancialInstitutionsService } from 'src/module/financial-institutions/services/financial-institutions.service';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';
import { SalaryService } from 'src/module/salary/services/salary.service';
import { GmailApiClient } from './gmail-api-client.service';
import { DuplicateDetectorService } from './duplicate-detector.service';
import {
  ProcessedEmailRepository,
  CreateProcessedEmailData,
} from '../repositories/processed-email.repository';
import { ParsedBankEmail } from '../parsers/bank-email-parser.interface';
import { getBankParser } from '../parsers/bank-parser.registry';
import { resolveTransactionKind } from '../parsers/transaction-type-mapping';
import { extractEmailBodyText } from '../utils/email-body.util';
import { extractSenderEmail } from '../utils/sender-email.util';
import {
  buildGmailSearchQuery,
  resolveSyncWindowStart,
} from '../utils/sync-window.util';
import { PROCESSED_EMAIL_REASONS } from '../gmail-sync.constants';

type SenderWithInstitution = InstitutionSender & {
  institution: FinancialInstitution;
};

/**
 * Per-user sync pass: list → fetch → classify → create/skip → audit. Called
 * once per connection by `GmailSyncScheduler`, which is responsible for
 * isolating one user's failure from the rest (see its own try/catch) — this
 * class only isolates failures *per message* so one malformed email doesn't
 * abort the rest of the same user's batch.
 */
@Injectable()
export class GmailSyncOrchestrator {
  private readonly logger = new Logger(GmailSyncOrchestrator.name);

  constructor(
    private readonly gmailApiClient: GmailApiClient,
    private readonly gmailOAuthService: GmailOAuthService,
    private readonly financialInstitutionsService: FinancialInstitutionsService,
    private readonly processedEmailRepository: ProcessedEmailRepository,
    private readonly duplicateDetector: DuplicateDetectorService,
    private readonly transactionsService: TransactionsService,
    private readonly salaryService: SalaryService,
  ) {}

  async syncConnection(connection: GmailConnection): Promise<void> {
    const now = new Date();
    const senders =
      await this.financialInstitutionsService.findActiveSendersForUser(
        connection.userId,
      );

    if (senders.length > 0) {
      const afterDate = resolveSyncWindowStart(connection.lastSyncAt, now);
      const query = buildGmailSearchQuery(
        senders.map((sender) => sender.emailAddress),
        afterDate,
      );

      // May throw GmailConnectionRevokedError: left to propagate to
      // GmailSyncScheduler's per-user try/catch. getValidAccessToken itself
      // already marks the connection Revoked before throwing — nothing else
      // to do here except let the caller skip this user and move on.
      const accessToken = await this.gmailOAuthService.getValidAccessToken(
        connection.userId,
      );

      const sendersByEmail = new Map<string, SenderWithInstitution>(
        senders.map((sender) => [sender.emailAddress.toLowerCase(), sender]),
      );

      const messageIds = await this.gmailApiClient.listMessageIds(
        accessToken,
        query,
      );

      for (const { id: messageId } of messageIds) {
        await this.processMessage(
          connection.userId,
          messageId,
          accessToken,
          sendersByEmail,
          connection.lastSyncAt,
        );
      }
    }

    await this.gmailOAuthService.markSynced(connection.userId, now);
  }

  private async processMessage(
    userId: number,
    messageId: string,
    accessToken: string,
    sendersByEmail: Map<string, SenderWithInstitution>,
    lastSyncAt: Date | null,
  ): Promise<void> {
    const alreadyProcessed =
      await this.processedEmailRepository.findByUserAndMessage(
        userId,
        messageId,
      );
    if (alreadyProcessed) {
      return;
    }

    let senderEmail: string | null = null;

    try {
      const message = await this.gmailApiClient.getMessage(
        accessToken,
        messageId,
      );
      senderEmail = extractSenderEmail(message);

      // Pure network-level noise filter from after:'s day granularity, not a
      // processing decision — no audit row, since nothing was actually
      // evaluated. The idempotency check above is the real safety net.
      if (lastSyncAt) {
        const internalDate = new Date(Number(message.internalDate));
        if (internalDate.getTime() <= lastSyncAt.getTime()) {
          return;
        }
      }

      const sender = senderEmail ? sendersByEmail.get(senderEmail) : undefined;
      if (!sender) {
        await this.recordOutcome({
          userId,
          gmailMessageId: messageId,
          senderEmail,
          result: ProcessedEmailResult.Ignored,
          reason: PROCESSED_EMAIL_REASONS.SENDER_NOT_CONFIGURED,
        });
        return;
      }

      const parser = getBankParser(sender.institution.parserKey);
      if (!parser) {
        await this.recordOutcome({
          userId,
          gmailMessageId: messageId,
          senderEmail,
          result: ProcessedEmailResult.Ignored,
          reason: PROCESSED_EMAIL_REASONS.NO_PARSER_CONFIGURED,
        });
        return;
      }

      // text/plain first, falling back to text/html converted to text —
      // Banco Agrícola's transaction confirmations only ever carry the
      // latter (confirmed against a real sample, see
      // docs/correos/transacciones-bancamovil.txt).
      const bodyText = extractEmailBodyText(message.payload) ?? '';
      const parseResult = parser.parse(bodyText);

      if ('kind' in parseResult && parseResult.kind === 'NOT_FINANCIAL') {
        await this.recordOutcome({
          userId,
          gmailMessageId: messageId,
          senderEmail,
          result: ProcessedEmailResult.Ignored,
          reason: PROCESSED_EMAIL_REASONS.NOT_FINANCIAL,
          parserVersion: parser.version,
        });
        return;
      }

      const parsed = parseResult as ParsedBankEmail;
      const transactionKind = resolveTransactionKind(parsed.transactionType);

      if (!transactionKind) {
        await this.recordOutcome({
          userId,
          gmailMessageId: messageId,
          senderEmail,
          result: ProcessedEmailResult.NeedsReview,
          reason: PROCESSED_EMAIL_REASONS.unknownTransactionType(
            parsed.transactionType,
          ),
          parserVersion: parser.version,
        });
        return;
      }

      if (transactionKind.kind === 'expense') {
        await this.handleExpense(
          userId,
          messageId,
          senderEmail,
          parser.version,
          sender.institution.id,
          parsed,
        );
        return;
      }

      await this.handleIncome(
        userId,
        messageId,
        senderEmail,
        parser.version,
        sender.institution.id,
        parsed,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Gmail sync: failed to process message ${messageId} for user ${userId}: ${message}`,
      );
      await this.recordOutcome({
        userId,
        gmailMessageId: messageId,
        senderEmail,
        result: ProcessedEmailResult.Failed,
        reason: PROCESSED_EMAIL_REASONS.processingFailed(message),
      });
    }
  }

  private async handleExpense(
    userId: number,
    messageId: string,
    senderEmail: string | null,
    parserVersion: string,
    institutionId: number,
    parsed: ParsedBankEmail,
  ): Promise<void> {
    const duplicate = await this.duplicateDetector.findManualDuplicate(
      userId,
      parsed.amount,
      parsed.date,
    );

    if (duplicate) {
      await this.recordOutcome({
        userId,
        gmailMessageId: messageId,
        senderEmail,
        result: ProcessedEmailResult.PossibleDuplicate,
        reason: PROCESSED_EMAIL_REASONS.POSSIBLE_DUPLICATE,
        parserVersion,
        relatedTransactionId: duplicate.id,
        // Captured so "create-anyway" (ProcessedEmailsService) can later
        // build a real Transaction without ever inventing amount/date.
        parsedAmount: parsed.amount,
        parsedDate: parsed.date,
        parsedDescription: parsed.notes,
      });
      return;
    }

    const created = await this.transactionsService.createFromGmail(userId, {
      amount: parsed.amount,
      date: parsed.date,
      description: parsed.notes,
      institutionId,
      gmailMessageId: messageId,
    });

    await this.recordOutcome({
      userId,
      gmailMessageId: messageId,
      senderEmail,
      result: ProcessedEmailResult.Created,
      parserVersion,
      relatedTransactionId: created.id,
    });
  }

  private async handleIncome(
    userId: number,
    messageId: string,
    senderEmail: string | null,
    parserVersion: string,
    institutionId: number,
    parsed: ParsedBankEmail,
  ): Promise<void> {
    const created = await this.salaryService.createFromGmail(userId, {
      amount: parsed.amount,
      date: parsed.date,
      institutionId,
      gmailMessageId: messageId,
    });

    await this.recordOutcome({
      userId,
      gmailMessageId: messageId,
      senderEmail,
      result: ProcessedEmailResult.Created,
      parserVersion,
      relatedSalaryId: created.id,
    });
  }

  private recordOutcome(data: CreateProcessedEmailData) {
    return this.processedEmailRepository.create(data);
  }
}
