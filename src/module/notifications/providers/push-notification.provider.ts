import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationType,
  PushSubscription,
  User,
} from '@prisma/client';
import * as webpush from 'web-push';
import { VapidConfigService } from '../config/vapid-config.service';
import { PushSubscriptionRepository } from '../repositories/push-subscription.repository';
import {
  NotificationPayload,
  NotificationProvider,
} from '../notifications.types';

/** How long the push service keeps an undelivered message (device offline)
 * before dropping it. A "you have pending reviews" nudge older than a day is
 * stale — the next sync pass will send a fresh one anyway. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;

/** Socket timeout per push-service request, so a hung endpoint can't stall
 * a Gmail sync pass. */
const PUSH_REQUEST_TIMEOUT_MS = 10_000;

/** `tag` lets the browser replace a previous notification of the same kind
 * instead of stacking them. Keyed by type so every future type is forced to
 * pick one. */
const PUSH_TAG_BY_TYPE: Record<NotificationType, string> = {
  [NotificationType.GmailReviewPending]: 'gmail-review',
  [NotificationType.BudgetThresholdAlert]: 'budget-alert',
};

/** Push service answers meaning "this subscription no longer exists" —
 * the row must be deleted, retrying is pointless. */
const GONE_STATUS_CODES = new Set([404, 410]);

/** JSON the frontend service worker receives in its `push` event. */
export interface PushMessage {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly tag: string;
}

/**
 * Standard Web Push (RFC 8030 + VAPID RFC 8292) via the `web-push` npm
 * package — no Firebase. Sends the same message to every browser the user
 * subscribed (`PushSubscription` rows); counts as delivered if at least one
 * push service accepted it. Subscriptions the push service reports as gone
 * (404/410) are deleted on the spot. Throws when nothing was delivered so
 * `NotificationsService` falls back to email.
 */
@Injectable()
export class PushNotificationProvider implements NotificationProvider {
  readonly channel = NotificationChannel.Push;
  private readonly logger = new Logger(PushNotificationProvider.name);

  constructor(
    private readonly vapidConfig: VapidConfigService,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
  ) {}

  async canDeliver(user: User): Promise<boolean> {
    if (!this.vapidConfig.isEnabled) {
      return false;
    }
    const count = await this.pushSubscriptionRepository.countByUserId(user.id);
    return count > 0;
  }

  async send(user: User, payload: NotificationPayload): Promise<void> {
    const vapidDetails = this.vapidConfig.getDetails();
    if (!vapidDetails) {
      throw new Error('Web Push is disabled (VAPID not configured)');
    }

    const subscriptions = await this.pushSubscriptionRepository.findByUserId(
      user.id,
    );
    if (subscriptions.length === 0) {
      throw new Error(`User ${user.id} has no push subscriptions`);
    }

    const message: PushMessage = {
      title: payload.subject,
      body: payload.body,
      url: payload.ctaPath ?? '/',
      tag: PUSH_TAG_BY_TYPE[payload.type],
    };
    const body = JSON.stringify(message);

    const results = await Promise.all(
      subscriptions.map((subscription) =>
        this.sendToSubscription(subscription, body, vapidDetails),
      ),
    );
    const delivered = results.filter(Boolean).length;

    if (delivered === 0) {
      throw new Error(
        `Push not delivered to any of ${subscriptions.length} subscription(s) for user ${user.id}`,
      );
    }
  }

  /** Resolves `true` if the push service accepted the message; `false` on
   * any failure (never rejects, so one bad device can't hide the others). */
  private async sendToSubscription(
    subscription: PushSubscription,
    body: string,
    vapidDetails: webpush.RequestOptions['vapidDetails'],
  ): Promise<boolean> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        body,
        {
          vapidDetails,
          TTL: PUSH_TTL_SECONDS,
          timeout: PUSH_REQUEST_TIMEOUT_MS,
          urgency: 'normal',
        },
      );
      return true;
    } catch (error) {
      const statusCode = getStatusCode(error);
      if (statusCode !== undefined && GONE_STATUS_CODES.has(statusCode)) {
        this.logger.log(
          `Push subscription ${subscription.id} (user ${subscription.userId}) is gone (${statusCode}) — deleting it`,
        );
        await this.deleteQuietly(subscription.id);
        return false;
      }
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Push to subscription ${subscription.id} (user ${subscription.userId}) failed${
          statusCode !== undefined ? ` with status ${statusCode}` : ''
        }: ${message}`,
      );
      return false;
    }
  }

  private async deleteQuietly(subscriptionId: number): Promise<void> {
    try {
      await this.pushSubscriptionRepository.deleteById(subscriptionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Failed to delete stale push subscription ${subscriptionId}: ${message}`,
      );
    }
  }
}

/** `web-push` rejects with a `WebPushError` carrying `statusCode`; read it
 * structurally rather than via `instanceof` so it also works across module
 * copies/mocks. */
function getStatusCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error as { statusCode: unknown };
    return typeof statusCode === 'number' ? statusCode : undefined;
  }
  return undefined;
}
