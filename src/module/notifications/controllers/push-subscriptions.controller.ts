import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { PushSubscriptionsService } from '../services/push-subscriptions.service';
import { CreatePushSubscriptionDto } from '../dto/create-push-subscription.dto';
import { UnsubscribePushDto } from '../dto/unsubscribe-push.dto';

/**
 * Web Push (VAPID) subscription management. The guard is per-route because
 * the VAPID public key is public by definition and is fetched before login
 * state matters.
 */
@ApiTags('notifications')
@Controller('notifications/push')
export class PushSubscriptionsController {
  constructor(
    private readonly pushSubscriptionsService: PushSubscriptionsService,
  ) {}

  @Get('vapid-public-key')
  @ApiOperation({
    summary:
      'Clave pública VAPID para pushManager.subscribe (null si push está deshabilitado)',
  })
  @ApiOkResponse({ schema: { example: { publicKey: 'BEl6...' } } })
  getVapidPublicKey() {
    return this.pushSubscriptionsService.getPublicKey();
  }

  @Post('subscriptions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Registra (o reasigna al usuario actual) la suscripción push de este navegador',
  })
  @ApiCreatedResponse({ schema: { example: { ok: true } } })
  subscribe(@Request() req, @Body() dto: CreatePushSubscriptionDto) {
    return this.pushSubscriptionsService.subscribe(req.user.userId, dto);
  }

  // POST rather than DELETE on purpose: the frontend's HTTP client drops the
  // body on DELETE requests, and the endpoint URL is too long/opaque to put
  // in a path param.
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Elimina la suscripción push de este navegador (idempotente)',
  })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  unsubscribe(@Request() req, @Body() dto: UnsubscribePushDto) {
    return this.pushSubscriptionsService.unsubscribe(
      req.user.userId,
      dto.endpoint,
    );
  }
}
