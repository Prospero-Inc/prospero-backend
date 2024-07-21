import { IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAmountDto {
  @ApiProperty({
    description: 'Monto a distribuir',
    example: 1000,
  })
  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
