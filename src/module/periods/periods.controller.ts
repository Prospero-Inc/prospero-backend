import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-guard';
import { PeriodsService } from './periods.service';

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
}
