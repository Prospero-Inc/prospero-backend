import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MailModule } from '../mail/mail.module';
import { UserModule } from '../user/user.module';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { NotificationsService } from './services/notifications.service';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';
import { NotificationLogRepository } from './repositories/notification-log.repository';
import { MailNotificationProvider } from './providers/mail-notification.provider';
import {
  NOTIFICATION_PROVIDERS,
  NotificationProvider,
} from './notifications.types';

/**
 * Channel-agnostic notifications module (see `notifications.types.ts` for
 * the full design rationale). `NOTIFICATION_PROVIDERS` is assembled here via
 * a `useFactory` so adding a second channel later (push/FCM) is a one-line
 * change to this array — no other module needs to change.
 */
@Module({
  imports: [MailModule, UserModule],
  controllers: [NotificationPreferencesController],
  providers: [
    PrismaService,
    NotificationsService,
    NotificationPreferencesService,
    NotificationPreferenceRepository,
    NotificationLogRepository,
    MailNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        mailProvider: MailNotificationProvider,
      ): NotificationProvider[] => [mailProvider],
      inject: [MailNotificationProvider],
    },
  ],
  exports: [NotificationsService, NotificationPreferencesService],
})
export class NotificationsModule {}
