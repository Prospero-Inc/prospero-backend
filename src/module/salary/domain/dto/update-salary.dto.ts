import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IncomeCategory, IncomeReviewStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateSalaryDto } from './create-salary.dto';

export class UpdateSalaryDto extends PartialType(CreateSalaryDto) {
  @ApiProperty({
    description:
      'Categoría del ingreso (Payroll/Extra/Transferencia/Reembolso/Depósito/Otro). ' +
      'Un ingreso detectado desde Gmail nace sin categoría ("Por clasificar"); ' +
      'asignarla aquí es lo que el usuario hace al revisarlo/clasificarlo, lo que ' +
      'además transiciona automáticamente su `status` de Detected/PendingReview a Classified.',
    enum: IncomeCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(IncomeCategory)
  incomeCategory?: IncomeCategory;
}

// `status` is never on the public DTO (no external client may set it
// directly) — only SalaryService.update may transition it, mirroring
// transactions' UpdateTransactionInput pattern.
export interface UpdateSalaryInput extends UpdateSalaryDto {
  status?: IncomeReviewStatus;
}
