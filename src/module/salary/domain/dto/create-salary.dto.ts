import { ApiProperty } from '@nestjs/swagger';
import { IncomeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateSalaryDto {
  @ApiProperty({
    description: 'Monto del ingreso a crear',
    example: 5000,
  })
  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'Fecha real en la que cayó el ingreso',
    example: '2026-09-15',
  })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  date: Date;

  @ApiProperty({
    description:
      'Tipo de ingreso: Payroll (nómina, abre/cierra períodos) o Extra (bono, venta, regalo — no abre período)',
    enum: IncomeType,
    default: IncomeType.Payroll,
    required: false,
  })
  @IsOptional()
  @IsEnum(IncomeType)
  type?: IncomeType;
}
