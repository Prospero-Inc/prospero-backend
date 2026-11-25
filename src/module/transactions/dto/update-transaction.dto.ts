import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  ValidateIf,
} from 'class-validator';
import { BudgetCategory } from '@prisma/client';
import { i18nValidationMessage } from 'nestjs-i18n';
import { CreateTransactionDto } from './create-transaction.dto';

/** Omitted means "leave it"; null is rejected instead of clearing a
 * required column (PartialType's @IsOptional would let null through). */
const unlessOmitted = () => ValidateIf((_, value) => value !== undefined);
const notNull = () =>
  IsNotEmpty({ message: i18nValidationMessage('validation.NOT_EMPTY') });

export class UpdateTransactionDto extends PartialType(
  OmitType(CreateTransactionDto, ['amount', 'date', 'category'] as const),
) {
  @ApiPropertyOptional()
  @unlessOmitted()
  @notNull()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional()
  @unlessOmitted()
  @notNull()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @ApiPropertyOptional({ enum: BudgetCategory })
  @unlessOmitted()
  @notNull()
  @IsEnum(BudgetCategory)
  category?: BudgetCategory;

  @ApiPropertyOptional({
    description:
      'Si el PATCH asigna categoría, recordarla para este comercio (MerchantRule). Por defecto true. No se guarda en el movimiento.',
    default: true,
  })
  // The global pipe's enableImplicitConversion would turn any string
  // ("false", "no") into true: read the raw body value so only a real
  // boolean passes and anything else fails @IsBoolean.
  @Transform(({ obj }) => (obj as Record<string, unknown>).rememberMerchant)
  @IsOptional()
  @IsBoolean()
  rememberMerchant?: boolean;
}
