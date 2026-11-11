import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateTransactionDto } from './create-transaction.dto';

export class UpdateTransactionDto extends PartialType(CreateTransactionDto) {
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
