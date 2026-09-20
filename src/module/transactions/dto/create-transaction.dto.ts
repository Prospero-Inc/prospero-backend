import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { BudgetCategory, PeriodOverride } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateTransactionDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDate()
  @Type(() => Date)
  date: Date;

  @IsEnum(BudgetCategory)
  category: BudgetCategory;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsEnum(PeriodOverride)
  periodOverride?: PeriodOverride;
}
