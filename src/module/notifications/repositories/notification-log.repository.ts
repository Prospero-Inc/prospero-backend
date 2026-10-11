import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

export interface CreateNotificationLogData {
  userId: number;
  type: NotificationType;
  channel: NotificationChannel;
  subject: string;
  metadata?: Record<string, unknown>;
}

/**
 * Audit trail only — "what was actually sent to whom, via which channel".
 * `NotificationsService` writes one row per provider that successfully
 * delivered a given `NotificationPayload`; a provider failure is logged via
 * `Logger`, never persisted here (see `notifications.types.ts`'s
 * `NotificationProvider` doc comment).
 */
@Injectable()
export class NotificationLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateNotificationLogData) {
    return this.prisma.notificationLog.create({
      data: {
        ...data,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
