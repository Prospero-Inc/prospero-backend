import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BudgetCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export const WALLET_CARD_NAME_MAX_LENGTH = 100;

export class CreateWalletCardDto {
  @ApiProperty({
    description:
      'Nombre exacto de la tarjeta tal como lo envía Atajos (Apple Wallet).',
    example: 'BAC Visa',
    maxLength: WALLET_CARD_NAME_MAX_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(WALLET_CARD_NAME_MAX_LENGTH)
  name: string;

  // @IsOptional also lets an explicit null through: null clears the field.
  @ApiPropertyOptional({
    description:
      'Categoría por defecto de los gastos con esta tarjeta. null = según el comercio (o a revisión).',
    enum: BudgetCategory,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(BudgetCategory)
  defaultCategory?: BudgetCategory | null;

  @ApiPropertyOptional({
    description:
      'Banco al que pertenece la tarjeta (propio del usuario). null para quitarlo.',
    nullable: true,
    example: 3,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  financialInstitutionId?: number | null;
}
