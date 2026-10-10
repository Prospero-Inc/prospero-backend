import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TransactionReviewStatus } from '@prisma/client';
import { FindTransactionsQueryDto } from './find-transactions-query.dto';

describe('FindTransactionsQueryDto', () => {
  it('parses a comma-separated reviewStatus query param into an array', async () => {
    const dto = plainToInstance(FindTransactionsQueryDto, {
      reviewStatus: 'Detected,PendingReview',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reviewStatus).toEqual([
      TransactionReviewStatus.Detected,
      TransactionReviewStatus.PendingReview,
    ]);
  });

  it('parses repeated reviewStatus query params (already an array) the same way', async () => {
    const dto = plainToInstance(FindTransactionsQueryDto, {
      reviewStatus: ['Detected', 'PendingReview'],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reviewStatus).toEqual([
      TransactionReviewStatus.Detected,
      TransactionReviewStatus.PendingReview,
    ]);
  });

  it('is valid and leaves reviewStatus undefined when the param is absent, preserving current behavior', async () => {
    const dto = plainToInstance(FindTransactionsQueryDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.reviewStatus).toBeUndefined();
  });

  it('rejects an invalid reviewStatus value', async () => {
    const dto = plainToInstance(FindTransactionsQueryDto, {
      reviewStatus: 'NotARealStatus',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
