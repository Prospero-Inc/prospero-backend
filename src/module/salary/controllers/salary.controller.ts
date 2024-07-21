import { Body, Controller, Post, Query } from '@nestjs/common';
import { SalaryService } from '../services/salary.service';
import { CreateAmountDto } from '../domain/dto/create-amount.dto';
import { FiftyThirtyTwentyStrategy } from '../strategies/fifty-thirty-twenty.strategy';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto copy';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('salary')
@Controller('salary')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @Post('distribute/fifty-thirty-twenty')
  @ApiOperation({ summary: 'Distribuir salario según la estrategia 50-30-20' })
  @ApiQuery({ name: 'userId', type: Number, description: 'ID del usuario' })
  @ApiBody({
    type: CreateAmountDto,
    description: 'Detalles del monto a distribuir',
  })
  @ApiResponse({ status: 201, description: 'Salario distribuido exitosamente' })
  @ApiResponse({ status: 500, description: 'Error al distribuir el salario' })
  async distributeFiftyThirtyTwenty(
    @Query('userId') userId: number,
    @Body() createAmountDto: CreateAmountDto,
  ) {
    this.salaryService.setStrategy(new FiftyThirtyTwentyStrategy());
    return this.salaryService.distributeSalary(userId, createAmountDto);
  }

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo salario' })
  @ApiQuery({ name: 'userId', type: Number, description: 'ID del usuario' })
  @ApiBody({
    type: CreateSalaryDto,
    description: 'Detalles del salario a crear',
  })
  @ApiResponse({
    status: 201,
    description: 'Salario creado exitosamente',
    type: Object,
    schema: { example: { message: 'Salario creado exitosamente' } },
  })
  @ApiResponse({
    status: 500,
    description: 'Error al crear el salario',
    type: Object,
    schema: {
      example: { statusCode: 500, message: 'Error al crear el salario' },
    },
  })
  async createSalary(
    @Query('userId') userId: number,
    @Body() createSalaryDto: CreateSalaryDto,
  ) {
    const { amount } = createSalaryDto;
    return this.salaryService.createSalary(+userId, amount);
  }
}
