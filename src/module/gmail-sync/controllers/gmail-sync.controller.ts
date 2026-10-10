import {
  ConflictException,
  Controller,
  HttpCode,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { GmailOAuthService } from '../../gmail/services/gmail-oauth.service';
import { GmailConnectionRevokedError } from '../../gmail/types';
import { GmailSyncOrchestrator } from '../services/gmail-sync-orchestrator.service';

@ApiTags('gmail-sync')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('gmail-sync')
export class GmailSyncController {
  constructor(
    private readonly gmailOAuthService: GmailOAuthService,
    private readonly orchestrator: GmailSyncOrchestrator,
  ) {}

  /**
   * Manual trigger, mainly for testing/impatience — the hourly
   * `GmailSyncScheduler` cron is the real production path. Throttled since
   * each call burns Gmail API quota; synchronous (no job queue exists) so
   * the caller waits for the sync to finish before getting a response.
   */
  @Post('sync-now')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Dispara una sincronización de Gmail inmediata para el usuario autenticado, sin esperar al cron de cada hora',
  })
  async syncNow(@Request() req): Promise<{ synced: true }> {
    const connection = await this.gmailOAuthService.getActiveConnectionForUser(
      req.user.userId,
    );

    try {
      await this.orchestrator.syncConnection(connection);
    } catch (error) {
      if (error instanceof GmailConnectionRevokedError) {
        throw new ConflictException(
          'La conexión con Gmail fue revocada, reconectá tu cuenta para volver a sincronizar',
        );
      }
      throw error;
    }

    return { synced: true };
  }
}
