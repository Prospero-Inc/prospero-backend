import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import {
  ShortcutStatus,
  ShortcutStatusService,
} from '../services/shortcut-status.service';

@ApiTags('shortcuts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('shortcuts')
export class ShortcutStatusController {
  constructor(private readonly status: ShortcutStatusService) {}

  @Get('status')
  @ApiOperation({
    summary:
      'Estado "Funcionando": el último gasto recibido desde Atajos (null si nunca llegó ninguno).',
  })
  get(@Request() req): Promise<ShortcutStatus> {
    return this.status.getStatus(req.user.userId);
  }
}
