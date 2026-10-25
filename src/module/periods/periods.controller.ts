import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-guard';
import { PeriodsService } from './periods.service';
import { FindPeriodMovementsQueryDto } from './dto/find-period-movements-query.dto';

@ApiTags('periods')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('periods')
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Resumen del período actual (abierto)' })
  getCurrent(@Request() req) {
    return this.periodsService.getCurrentPeriodSummary(req.user.userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista de todos los períodos, del más reciente al más antiguo',
  })
  list(@Request() req) {
    return this.periodsService.listPeriods(req.user.userId);
  }

  @Get('month')
  @ApiOperation({
    summary: 'Ingresos y gastos totales del mes calendario actual',
  })
  getMonth(@Request() req) {
    return this.periodsService.getMonthSummary(req.user.userId);
  }

  @Get('transactions')
  @ApiOperation({
    summary:
      'Gastos que cuentan para un período (respeta periodOverride), del más reciente al más antiguo',
  })
  listTransactions(
    @Request() req,
    @Query() query: FindPeriodMovementsQueryDto,
  ) {
    return this.periodsService.listTransactionsForPeriod(
      req.user.userId,
      query.period,
    );
  }

  @Get('salary')
  @ApiOperation({
    summary: 'Ingresos de un período, del más reciente al más antiguo',
  })
  listSalary(@Request() req, @Query() query: FindPeriodMovementsQueryDto) {
    return this.periodsService.listSalariesForPeriod(
      req.user.userId,
      query.period,
    );
  }
}
