import { Injectable } from '@nestjs/common';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { UpdateNotificationPreferencesDto } from '../dto/update-notification-preferences.dto';

/**
 * Thin CRUD wrapper around `NotificationPreferenceRepository`, kept
 * separate from `NotificationsService` (the dispatcher) — one is "what does
 * this user want", the other is "send this, respecting what they want".
 * Backs `GET/PATCH /notifications/preferences`, the endpoint the frontend
 * uses to register the user's channel preference.
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(
    private readonly notificationPreferenceRepository: NotificationPreferenceRepository,
  ) {}

  getForUser(userId: number) {
    return this.notificationPreferenceRepository.findOrDefault(userId);
  }

  updateForUser(userId: number, dto: UpdateNotificationPreferencesDto) {
    return this.notificationPreferenceRepository.upsert(userId, dto);
  }
}
