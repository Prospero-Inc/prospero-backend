import { Injectable } from '@nestjs/common';
import { SalaryService } from '../salary/services/salary.service';
import { TransactionsService } from '../transactions/services/transactions.service';

export interface ReviewQueueSummary {
  pendingTransactions: number;
  pendingSalaries: number;
}

/**
 * Backs the nav badge: "how many Gmail-detected rows still need the user's
 * attention". Deliberately thin — both counts are a single `count()` each
 * (see `TransactionsService.countPendingReview`/`SalaryService.
 * countPendingReview`), never a full row fetch, so this stays cheap enough
 * to poll from the frontend shell on every page load.
 */
@Injectable()
export class ReviewQueueService {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly salaryService: SalaryService,
  ) {}

  async getSummary(userId: number): Promise<ReviewQueueSummary> {
    const [pendingTransactions, pendingSalaries] = await Promise.all([
      this.transactionsService.countPendingReview(userId),
      this.salaryService.countPendingReview(userId),
    ]);

    return { pendingTransactions, pendingSalaries };
  }
}
