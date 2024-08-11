import { Body, Controller, Post, Query, Get, UseGuards } from '@nestjs/common';
import { SalaryService } from '../services/salary.service';
import { CreateAmountDto } from '../domain/dto/create-amount.dto';
import { FiftyThirtyTwentyStrategy } from '../strategies/fifty-thirty-twenty.strategy';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto copy';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SalaryDetailsDto } from '../dto/salary-details.dto';

@ApiTags('salary')
@Controller('salary')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

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
    this.salaryService.setStrategy(new FiftyThirtyTwentyStrategy());
    const { amount } = createSalaryDto;
    return this.salaryService.createSalary(+userId, amount);
  }

  @Get('distribute/preview')
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Previsualización de la distribución del salario',
  })
  @ApiQuery({
    name: 'amount',
    type: Number,
    description: 'Monto a distribuir',
  })
  @ApiResponse({
    status: 200,
    description: 'Aquí está la previsualización de la distribución del salario',
  })
  @ApiResponse({
    status: 500,
    description: 'Error al distribuir el salario',
  })
  async distributeSalaryPreview(@Query() createAmountDto: CreateAmountDto) {
    this.salaryService.setStrategy(new FiftyThirtyTwentyStrategy());
    return this.salaryService.distributeSalaryPrevious(createAmountDto);
  }

  @Get('details')
  @ApiOperation({ summary: 'Obtener detalles del salario del usuario' })
  @ApiQuery({
    name: 'userId',
    type: Number,
    description: 'ID del usuario para obtener detalles del salario',
  })
  @ApiOkResponse({
    description: 'Detalles del salario obtenidos exitosamente',
    type: SalaryDetailsDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Error al obtener los detalles del salario',
  })
  async getUserSalaryDetails(@Query('userId') userId: number) {
    return this.salaryService.getUserSalaryDetails(+userId);
  }
}
