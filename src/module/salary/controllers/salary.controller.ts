import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { SalaryService } from '../services/salary.service';
import { CreateAmountDto } from '../domain/dto/create-amount.dto';
import { CreateSalaryDto } from '../domain/dto/create-salary.dto';
import { UpdateSalaryDto } from '../domain/dto/update-salary.dto';
import { CustomStrategy } from '../strategies/custom.strategy';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { UserService } from '../../user/user.service';
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
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('salary')
export class SalaryController {
  constructor(
    private readonly salaryService: SalaryService,
    private readonly userService: UserService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo ingreso' })
  @ApiBody({
    type: CreateSalaryDto,
    description: 'Detalles del ingreso a crear',
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
  async createSalary(@Request() req, @Body() createSalaryDto: CreateSalaryDto) {
    return this.salaryService.create(req.user.userId, createSalaryDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar un ingreso existente' })
  @ApiResponse({ status: 200, description: 'Ingreso actualizado con éxito.' })
  async updateSalary(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSalaryDto: UpdateSalaryDto,
  ) {
    return this.salaryService.update(id, req.user.userId, updateSalaryDto);
  }

  @Get('distribute/preview')
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
  async distributeSalaryPreview(
    @Request() req,
    @Query() createAmountDto: CreateAmountDto,
  ) {
    const user = await this.userService.findById(req.user.userId);
    const strategy = new CustomStrategy(
      user.needsPercent,
      user.wantsPercent,
      user.savingsPercent,
    );
    return this.salaryService.distributeSalaryPreview(
      createAmountDto.amount,
      strategy,
    );
  }

  @Get('details')
  @ApiOperation({ summary: 'Obtener detalles del salario del usuario' })
  @ApiOkResponse({
    description: 'Detalles del salario obtenidos exitosamente',
    type: SalaryDetailsDto,
  })
  @ApiInternalServerErrorResponse({
    description: 'Error al obtener los detalles del salario',
  })
  async getUserSalaryDetails(@Request() req) {
    return this.salaryService.getUserSalaryDetails(req.user.userId);
  }
}
