import { IsNumber, IsNotEmpty } from 'class-validator';

export class CreateSalaryDto {
  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
