import { ApiPropertyOptional } from '@nestjs/swagger';
import { IncomeReviewStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional } from 'class-validator';

/** Mirrors `FindTransactionsQueryDto`'s comma-separated-or-repeated array
 * handling — see that file for why. */
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

export class FindSalaryQueryDto {
  @ApiPropertyOptional({
    description:
      'Filtra por estado de revisión. Acepta múltiples valores separados por coma ' +
      '(ej. ?status=Detected,PendingReview). Sin este parámetro, el comportamiento ' +
      'no cambia (se listan todos los ingresos del usuario).',
    enum: IncomeReviewStatus,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => splitCommaSeparated(value))
  @IsArray()
  @IsEnum(IncomeReviewStatus, { each: true })
  status?: IncomeReviewStatus[];
}
