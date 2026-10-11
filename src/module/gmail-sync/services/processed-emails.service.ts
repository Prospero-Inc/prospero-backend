import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProcessedEmailResult, Transaction } from '@prisma/client';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';
import { ProcessedEmailRepository } from '../repositories/processed-email.repository';

/**
 * Product decision already confirmed with the co-founder: there is no
 * "remember my choice for this sender" — every `PossibleDuplicate` is
 * resolved one at a time, explicitly, via this single action. Do not add a
 * per-sender preference here.
 */
@Injectable()
export class ProcessedEmailsService {
  constructor(
    private readonly processedEmailRepository: ProcessedEmailRepository,
    private readonly transactionsService: TransactionsService,
  ) {}

  /**
   * "Sí, créala igual": the user looked at a possible-duplicate email and
   * decided it's actually a separate transaction. Creates a real
   * `Transaction` (`source: Gmail`, `reviewStatus: PendingReview`, no
   * category — same as any other Gmail detection) from the snapshot
   * captured at detection time, then marks the email resolved so its badge
   * disappears from `GET /transactions`.
   */
  async createAnyway(id: number, userId: number): Promise<Transaction> {
    const processedEmail = await this.processedEmailRepository.findOneOwned(
      id,
      userId,
    );

    if (!processedEmail) {
      throw new NotFoundException('Processed email not found');
    }

    if (processedEmail.result !== ProcessedEmailResult.PossibleDuplicate) {
      throw new NotFoundException(
        'This processed email was never flagged as a possible duplicate',
      );
    }

    if (processedEmail.resolvedAt !== null) {
      throw new ConflictException(
        'This possible duplicate was already resolved',
      );
    }

    if (
      processedEmail.parsedAmount === null ||
      processedEmail.parsedDate === null
    ) {
      // Emails detected before this snapshot existed never captured
      // amount/date — refuse rather than invent them.
      throw new UnprocessableEntityException(
        'No parsed amount/date snapshot was recorded for this email, so a transaction cannot be created from it automatically',
      );
    }

    const created = await this.transactionsService.createFromGmail(userId, {
      amount: processedEmail.parsedAmount,
      date: processedEmail.parsedDate,
      description: processedEmail.parsedDescription ?? undefined,
      gmailMessageId: processedEmail.gmailMessageId,
    });

    await this.processedEmailRepository.markResolved(processedEmail.id);

    return created;
  }
}
