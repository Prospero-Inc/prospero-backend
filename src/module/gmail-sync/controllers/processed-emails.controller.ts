import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { ProcessedEmailsService } from '../services/processed-emails.service';

@ApiTags('processed-emails')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('processed-emails')
export class ProcessedEmailsController {
  constructor(
    private readonly processedEmailsService: ProcessedEmailsService,
  ) {}

  @Post(':id/create-anyway')
  @ApiOperation({
    summary:
      'Crea una transacción real a partir de un correo marcado como "posible duplicado", usando el monto/fecha/descripción detectados',
  })
  createAnyway(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.processedEmailsService.createAnyway(id, req.user.userId);
  }
}
