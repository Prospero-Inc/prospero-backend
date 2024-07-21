import { IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSalaryDto {
  @ApiProperty({
    description: 'Monto del salario a crear',
    example: 5000,
  })
  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
