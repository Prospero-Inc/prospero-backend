import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IncomeReviewStatus } from '@prisma/client';
import { FindSalaryQueryDto } from './find-salary-query.dto';

describe('FindSalaryQueryDto', () => {
  it('parses a comma-separated status query param into an array', async () => {
    const dto = plainToInstance(FindSalaryQueryDto, {
      status: 'Detected,PendingReview',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.status).toEqual([
      IncomeReviewStatus.Detected,
      IncomeReviewStatus.PendingReview,
    ]);
  });

  it('is valid and leaves status undefined when the param is absent, preserving current behavior', async () => {
    const dto = plainToInstance(FindSalaryQueryDto, {});

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.status).toBeUndefined();
  });

  it('rejects an invalid status value', async () => {
    const dto = plainToInstance(FindSalaryQueryDto, {
      status: 'NotARealStatus',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
