import { IsDateString, IsOptional } from 'class-validator';

export class FindTransactionsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
