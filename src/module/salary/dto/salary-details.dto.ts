import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

class DistributionDto {
  @ApiProperty({ example: 300, description: 'Gastos fijos' })
  @IsNumber()
  fixedExpenses: number;

  @ApiProperty({ example: 200, description: 'Gastos variables' })
  @IsNumber()
  variableExpenses: number;

  @ApiProperty({ example: 100, description: 'Ahorros' })
  @IsNumber()
  savings: number;
}

class SalaryDto {
  @ApiProperty({ example: 1000, description: 'Monto del salario' })
  @IsNumber()
  amount: number;

  @ApiProperty({ example: 'January', description: 'Mes del salario' })
  @IsString()
  month: string;

  @ApiProperty({ example: 2024, description: 'Año del salario' })
  @IsNumber()
  year: number;

  @ApiProperty({
    type: DistributionDto,
    description: 'Distribución del salario',
  })
  @ValidateNested()
  @Type(() => DistributionDto)
  distribution: DistributionDto;
}

export class SalaryDetailsDto {
  @ApiProperty({ example: 'john_doe', description: 'Nombre de usuario' })
  @IsString()
  username: string;

  @ApiProperty({
    type: [SalaryDto],
    description: 'Detalles del salario',
    example: [
      {
        amount: 1000,
        month: 'January',
        year: 2024,
        distribution: {
          fixedExpenses: 300,
          variableExpenses: 200,
          savings: 100,
        },
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryDto)
  salary: SalaryDto[];
}
