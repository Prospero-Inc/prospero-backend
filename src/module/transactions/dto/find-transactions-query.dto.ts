import { ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionReviewStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsOptional } from 'class-validator';

/** Accepts either `?reviewStatus=Detected,PendingReview` (comma-separated,
 * the form the frontend uses) or repeated `?reviewStatus=Detected&reviewStatus=PendingReview`
 * query params — Express/Nest already gives us an array for the latter. */
function splitCommaSeparated(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === 'string' ? item.split(',') : item,
    );
  }
  if (typeof value === 'string') {
    return value.split(',');
  }
  return value;
}

export class FindTransactionsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    description:
      'Filtra por estado de revisión. Acepta múltiples valores separados por coma ' +
      '(ej. ?reviewStatus=Detected,PendingReview). Sin este parámetro, el ' +
      'comportamiento no cambia (se listan todas las transacciones del usuario).',
    enum: TransactionReviewStatus,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => splitCommaSeparated(value))
  @IsArray()
  @IsEnum(TransactionReviewStatus, { each: true })
  reviewStatus?: TransactionReviewStatus[];
}
