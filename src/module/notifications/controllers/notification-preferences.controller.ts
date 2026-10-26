import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-guard';
import { NotificationPreferencesService } from '../services/notification-preferences.service';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';

/**
 * Registers a user's per-type, per-channel notification preferences. Push
 * device registration lives in `PushSubscriptionsController`
 * (`/notifications/push/*`); this endpoint only stores the opt-in toggles.
 */
@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('notifications/preferences')
export class NotificationPreferencesController {
  constructor(
    private readonly notificationPreferencesService: NotificationPreferencesService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Preferencias de notificación (correo y push) del usuario autenticado',
  })
  @ApiOkResponse({
    schema: {
      example: {
        gmailReviewEmailEnabled: true,
        gmailReviewPushEnabled: true,
        budgetAlertEmailEnabled: true,
      },
    },
  })
  getPreferences(@Request() req) {
    return this.notificationPreferencesService.getForUser(req.user.userId);
  }

  @Patch()
  @ApiOperation({
    summary: 'Actualiza las preferencias de notificación (correo y push)',
  })
  updatePreferences(
    @Request() req,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationPreferencesService.updateForUser(
      req.user.userId,
      dto,
    );
  }
}
