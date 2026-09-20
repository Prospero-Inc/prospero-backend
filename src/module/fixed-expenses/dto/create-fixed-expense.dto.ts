import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { BudgetCategory } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateFixedExpenseDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(BudgetCategory)
  budgetCategory: BudgetCategory;

  @IsDate()
  @Type(() => Date)
  dueDate: Date;

  @IsBoolean()
  reminder: boolean;

  @IsString()
  @IsOptional()
  description?: string;
}
