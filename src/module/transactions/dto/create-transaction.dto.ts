import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export enum TransactionType {
  FixedExpense = 'FixedExpense',
  VariableExpense = 'VariableExpense',
  Savings = 'Savings',
}

export class CreateTransactionDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsDate()
  date: Date;

  @IsString()
  category: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TransactionType)
  type: TransactionType;
}
