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
 * Registers a user's notification channel preference. Deliberately not a
 * device/FCM-token endpoint: v1 only ships the email channel (see
 * notifications module README-style comments for the sizing rationale) —
 * a `POST /notifications/device-tokens` endpoint would be the push
 * equivalent of this, added alongside `PushNotificationProvider` once that
 * exists.
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
    summary: 'Preferencias de notificación por correo del usuario autenticado',
  })
  @ApiOkResponse({
    schema: {
      example: {
        gmailReviewEmailEnabled: true,
        budgetAlertEmailEnabled: true,
      },
    },
  })
  getPreferences(@Request() req) {
    return this.notificationPreferencesService.getForUser(req.user.userId);
  }

  @Patch()
  @ApiOperation({
    summary: 'Actualiza las preferencias de notificación por correo',
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
