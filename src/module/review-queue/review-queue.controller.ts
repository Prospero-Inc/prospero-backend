import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-guard';
import { ReviewQueueService } from './review-queue.service';

@ApiTags('review-queue')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('review-queue')
export class ReviewQueueController {
  constructor(private readonly reviewQueueService: ReviewQueueService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Conteo de transacciones e ingresos detectados por Gmail pendientes de revisión, para el badge de navegación',
  })
  @ApiOkResponse({
    description: 'Conteos obtenidos exitosamente',
    schema: {
      example: { pendingTransactions: 3, pendingSalaries: 0 },
    },
  })
  getSummary(@Request() req) {
    return this.reviewQueueService.getSummary(req.user.userId);
  }
}
