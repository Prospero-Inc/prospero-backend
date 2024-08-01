import {
  IsDate,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

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
}
