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

/** Outcome of a single connection's sync pass — `transactionsCreated` lets
 * `GmailSyncScheduler` decide whether to notify the user, without this
 * class knowing anything about notifications itself. */
export interface SyncConnectionResult {
  transactionsCreated: number;
}

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
  ) {}

  async syncConnection(
    connection: GmailConnection,
  ): Promise<SyncConnectionResult> {
    const now = new Date();
    let transactionsCreated = 0;
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
        const created = await this.processMessage(
          connection.userId,
          messageId,
          accessToken,
          sendersByEmail,
          connection.lastSyncAt,
        );
        if (created) {
          transactionsCreated += 1;
        }
      }
    }

    await this.gmailOAuthService.markSynced(connection.userId, now);

    return { transactionsCreated };
  }

  /** Returns `true` only when this message resulted in a new
   * `reviewStatus: PendingReview` `Transaction` (i.e. `handleExpense`'s
   * success path) — the one outcome `GmailSyncScheduler` notifies about. */
  private async processMessage(
    userId: number,
    messageId: string,
    accessToken: string,
    sendersByEmail: Map<string, SenderWithInstitution>,
    lastSyncAt: Date | null,
  ): Promise<boolean> {
    const alreadyProcessed =
      await this.processedEmailRepository.findByUserAndMessage(
        userId,
        messageId,
      );
    if (alreadyProcessed) {
      return false;
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
          return false;
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
        return false;
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
        return false;
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
        return false;
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
        return false;
      }

      if (transactionKind.kind === 'expense') {
        return this.handleExpense(
          userId,
          messageId,
          senderEmail,
          parser.version,
          sender.institution.id,
          parsed,
        );
      }

      await this.handleIncome(userId, messageId, senderEmail, parser.version);
      return false;
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
      return false;
    }
  }

  private async handleExpense(
    userId: number,
    messageId: string,
    senderEmail: string | null,
    parserVersion: string,
    institutionId: number,
    parsed: ParsedBankEmail,
  ): Promise<boolean> {
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
      return false;
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
    return true;
  }

  /**
   * Product decision: income is always entered manually, never
   * auto-created from a detected email — see `handleExpense` for the
   * equivalent expense path, which does create a `Transaction`. No
   * `{TIPO}` currently maps to `kind: 'income'` in
   * `transaction-type-mapping.ts`, so this is unreached in practice today;
   * it exists so that whoever adds the first income-mapped type doesn't
   * have to rediscover this decision.
   */
  private async handleIncome(
    userId: number,
    messageId: string,
    senderEmail: string | null,
    parserVersion: string,
  ): Promise<void> {
    await this.recordOutcome({
      userId,
      gmailMessageId: messageId,
      senderEmail,
      result: ProcessedEmailResult.Ignored,
      reason: PROCESSED_EMAIL_REASONS.INCOME_DETECTION_DISABLED,
      parserVersion,
    });
  }

  private recordOutcome(data: CreateProcessedEmailData) {
    return this.processedEmailRepository.create(data);
  }
}
