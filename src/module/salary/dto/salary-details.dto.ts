import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { IncomeType } from '@prisma/client';

class SalaryEntryDto {
  @ApiProperty({ example: 1000, description: 'Monto del ingreso' })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: '2026-09-15', description: 'Fecha del ingreso' })
  date: Date;

  @ApiProperty({ enum: IncomeType, description: 'Tipo de ingreso' })
  type: IncomeType;
}

export class SalaryDetailsDto {
  @ApiProperty({ example: 'john_doe', description: 'Nombre de usuario' })
  @IsString()
  username: string;

  @ApiProperty({
    type: [SalaryEntryDto],
    description: 'Ingresos del mes calendario actual',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryEntryDto)
  salary: SalaryEntryDto[];
}
