import { Injectable } from '@nestjs/common';
import { Prisma, ProcessedEmail, ProcessedEmailResult } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

export interface CreateProcessedEmailData {
  userId: number;
  gmailMessageId: string;
  senderEmail?: string | null;
  result: ProcessedEmailResult;
  reason?: string | null;
  parserVersion?: string | null;
  relatedTransactionId?: number | null;
  relatedSalaryId?: number | null;
  /** Snapshot of what the parser extracted, independent of `result` — see
   * the schema comment on `ProcessedEmail.parsedAmount`. Only actually
   * populated today for the `PossibleDuplicate` case
   * (`GmailSyncOrchestrator.handleExpense`), but accepted here for every
   * outcome so a future caller doesn't need another migration-adjacent
   * change to start populating it elsewhere. */
  parsedAmount?: number | null;
  parsedDate?: Date | null;
  parsedDescription?: string | null;
  /** Set at creation only for outcomes nobody must act on (a duplicate of
   * a Shortcuts purchase, discarded silently). */
  resolvedAt?: Date | null;
}

/** Prisma's unique-constraint-violation error code. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_CONSTRAINT_VIOLATION;

@Injectable()
export class ProcessedEmailRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserAndMessage(
    userId: number,
    gmailMessageId: string,
  ): Promise<ProcessedEmail | null> {
    return this.prisma.processedEmail.findUnique({
      where: { userId_gmailMessageId: { userId, gmailMessageId } },
    });
  }

  findOneOwned(id: number, userId: number): Promise<ProcessedEmail | null> {
    return this.prisma.processedEmail.findFirst({
      where: { id, userId },
    });
  }

  /**
   * Creates the audit row. Swallows a unique-constraint violation on
   * `(userId, gmailMessageId)` as a no-op: the DB constraint (not this
   * check) is the final idempotency guard against concurrent syncs racing
   * each other — see spec §8 — so losing this race just means another
   * in-flight sync already recorded the same email.
   */
  async create(data: CreateProcessedEmailData): Promise<ProcessedEmail | null> {
    try {
      return await this.prisma.processedEmail.create({ data });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Creates the row `createRelated` returns (e.g. the Gmail expense) and the
   * audit row pointing at it in one transaction. If another sync already
   * recorded this email, the audit insert's unique violation rolls the
   * related row back too and this returns null ("already processed").
   */
  async createWithRelatedTransaction(
    data: CreateProcessedEmailData,
    createRelated: (tx: Prisma.TransactionClient) => Promise<{ id: number }>,
  ): Promise<ProcessedEmail | null> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const related = await createRelated(tx);
        return tx.processedEmail.create({
          data: { ...data, relatedTransactionId: related.id },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Marks a `PossibleDuplicate` row as handled by the user (via
   * "create-anyway" or "dismiss") so `possibleGmailDuplicate` stops
   * surfacing it. */
  markResolved(id: number): Promise<ProcessedEmail> {
    return this.prisma.processedEmail.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
  }
}
