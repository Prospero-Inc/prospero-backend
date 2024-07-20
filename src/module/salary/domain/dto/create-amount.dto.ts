import { IsNumber, IsNotEmpty } from 'class-validator';

export class CreateAmountDto {
  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
