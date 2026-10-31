import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';

/**
 * Liveness + readiness for docker compose's healthcheck, the deploy job and
 * the uptime monitor: 200 only when the app can actually reach Postgres.
 * Public and unthrottled; reveals nothing beyond up/down.
 */
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Estado de la API y de la base de datos' })
  @ApiResponse({ status: 200, description: 'API y base de datos disponibles.' })
  @ApiResponse({ status: 503, description: 'La base de datos no responde.' })
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Health check: database unreachable', error);
      throw new ServiceUnavailableException({ status: 'error' });
    }
    return { status: 'ok' };
  }
}
