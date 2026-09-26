import { ApiProperty } from '@nestjs/swagger';
import { BudgetCategory, IncomeType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
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

  @ApiProperty({
    description:
      'Solo aplica a ingresos type: Extra. Categoría de presupuesto a la que se ' +
      'asigna el 100% del monto (sin pasar por el split porcentual). Si no se ' +
      'especifica, el ingreso se reparte normalmente entre las tres categorías. ' +
      'No tiene efecto (y se rechaza) en ingresos type: Payroll.',
    enum: BudgetCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(BudgetCategory)
  budgetCategory?: BudgetCategory;

  @ApiProperty({
    description:
      'Solo aplica a ingresos type: Extra. Si es true, ignora budgetCategory y ' +
      'el monto se reparte por el split porcentual normal del usuario, igual que ' +
      'un Payroll. Default: false (el monto se asigna 100% a budgetCategory, si se ' +
      'especificó). No tiene efecto (y se rechaza) en ingresos type: Payroll.',
    default: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  distributeAutomatically?: boolean;
}
