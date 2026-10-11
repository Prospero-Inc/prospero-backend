import { Test, TestingModule } from '@nestjs/testing';
import { ReviewQueueService } from './review-queue.service';
import { TransactionsService } from '../transactions/services/transactions.service';
import { SalaryService } from '../salary/services/salary.service';

describe('ReviewQueueService', () => {
  let service: ReviewQueueService;
  let transactionsService: { countPendingReview: jest.Mock };
  let salaryService: { countPendingReview: jest.Mock };

  beforeEach(async () => {
    transactionsService = { countPendingReview: jest.fn() };
    salaryService = { countPendingReview: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewQueueService,
        { provide: TransactionsService, useValue: transactionsService },
        { provide: SalaryService, useValue: salaryService },
      ],
    }).compile();

    service = module.get<ReviewQueueService>(ReviewQueueService);
  });

  it('combines both pending counts for the authenticated user, scoped by userId', async () => {
    transactionsService.countPendingReview.mockResolvedValue(3);
    salaryService.countPendingReview.mockResolvedValue(1);

    const result = await service.getSummary(5);

    expect(transactionsService.countPendingReview).toHaveBeenCalledWith(5);
    expect(salaryService.countPendingReview).toHaveBeenCalledWith(5);
    expect(result).toEqual({ pendingTransactions: 3, pendingSalaries: 1 });
  });

  it('returns zeros when nothing is pending', async () => {
    transactionsService.countPendingReview.mockResolvedValue(0);
    salaryService.countPendingReview.mockResolvedValue(0);

    const result = await service.getSummary(5);

    expect(result).toEqual({ pendingTransactions: 0, pendingSalaries: 0 });
  });
});
