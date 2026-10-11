import { Test, TestingModule } from '@nestjs/testing';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewQueueService } from './review-queue.service';

describe('ReviewQueueController', () => {
  let controller: ReviewQueueController;
  let service: { getSummary: jest.Mock };

  beforeEach(async () => {
    service = { getSummary: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewQueueController],
      providers: [{ provide: ReviewQueueService, useValue: service }],
    }).compile();

    controller = module.get<ReviewQueueController>(ReviewQueueController);
  });

  it('returns the summary scoped to the authenticated user', async () => {
    const req = { user: { userId: 7 } };
    service.getSummary.mockResolvedValue({
      pendingTransactions: 2,
      pendingSalaries: 0,
    });

    const result = await controller.getSummary(req);

    expect(service.getSummary).toHaveBeenCalledWith(7);
    expect(result).toEqual({ pendingTransactions: 2, pendingSalaries: 0 });
  });
});
