import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MailModule } from '../mail/mail.module';
import { UserModule } from '../user/user.module';
import { NotificationPreferencesController } from './controllers/notification-preferences.controller';
import { PushSubscriptionsController } from './controllers/push-subscriptions.controller';
import { NotificationsService } from './services/notifications.service';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import { PushSubscriptionsService } from './services/push-subscriptions.service';
import { NotificationPreferenceRepository } from './repositories/notification-preference.repository';
import { NotificationLogRepository } from './repositories/notification-log.repository';
import { PushSubscriptionRepository } from './repositories/push-subscription.repository';
import { MailNotificationProvider } from './providers/mail-notification.provider';
import { PushNotificationProvider } from './providers/push-notification.provider';
import { VapidConfigService } from './config/vapid-config.service';
import {
  NOTIFICATION_PROVIDERS,
  NotificationProvider,
} from './notifications.types';

/**
 * Channel-agnostic notifications module (see `notifications.types.ts` for
 * the full design rationale). `NOTIFICATION_PROVIDERS` is assembled here via
 * a `useFactory`; the order of this array doesn't matter — channel priority
 * is `CHANNEL_PRIORITY` in `notifications.types.ts`.
 */
@Module({
  imports: [MailModule, UserModule],
  controllers: [NotificationPreferencesController, PushSubscriptionsController],
  providers: [
    PrismaService,
    VapidConfigService,
    NotificationsService,
    NotificationPreferencesService,
    PushSubscriptionsService,
    NotificationPreferenceRepository,
    NotificationLogRepository,
    PushSubscriptionRepository,
    MailNotificationProvider,
    PushNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        pushProvider: PushNotificationProvider,
        mailProvider: MailNotificationProvider,
      ): NotificationProvider[] => [pushProvider, mailProvider],
      inject: [PushNotificationProvider, MailNotificationProvider],
    },
  ],
  exports: [NotificationsService, NotificationPreferencesService],
})
export class NotificationsModule {}
