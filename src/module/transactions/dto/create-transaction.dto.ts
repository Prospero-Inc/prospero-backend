import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateTransactionDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDate()
  @Type(() => Date)
  date: Date;

  @IsString()
  category: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TransactionType)
  type: TransactionType;
}
