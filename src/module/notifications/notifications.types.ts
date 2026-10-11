import { NotificationChannel, NotificationType, User } from '@prisma/client';

/**
 * Channel-agnostic description of a single notification. Business-level
 * callers (GmailSyncScheduler today, a future budget-threshold watcher)
 * build one of these and hand it to `NotificationsService` — they never
 * import a specific provider (Mail, eventually FCM) directly. This is the
 * seam that keeps "what happened" (a Gmail sync created 3 reviewable
 * transactions) decoupled from "how the user is told" (email today, push
 * later, possibly both at once).
 */
export interface NotificationPayload {
  readonly type: NotificationType;
  readonly subject: string;
  readonly body: string;
  /** Optional deep link into the frontend, e.g. the transactions list
   * filtered to pending review. Providers that can't render a link
   * (hypothetically) are free to ignore it. */
  readonly ctaUrl?: string;
  readonly ctaLabel?: string;
  /** Freeform data worth keeping on the `NotificationLog` audit row for
   * later debugging/analytics (e.g. `{ pendingCount: 3 }`) — never used to
   * render the message itself, that's `subject`/`body`. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * One implementation per delivery channel. `NotificationsService` resolves
 * *which* providers to call for a given user (today: just Mail, gated by
 * `NotificationPreference`) and fans the same `NotificationPayload` out to
 * each of them — a provider never decides on its own whether to send,
 * that's the dispatcher's job.
 *
 * Only `MailNotificationProvider` exists right now. Adding push would mean:
 * 1. A `PushNotificationProvider` implementing this interface against
 *    Firebase Admin SDK (`firebase-admin`), using per-user FCM device
 *    tokens (a `DeviceToken` table keyed by userId+token, multi-row for
 *    multi-device — intentionally not built yet, see CLAUDE.md/PR
 *    description for why).
 * 2. Registering it alongside `MailNotificationProvider` under the
 *    `NOTIFICATION_PROVIDERS` token in `notifications.module.ts`.
 * No change to `NotificationsService`, `GmailSyncScheduler`, or any future
 * budget-threshold caller would be required.
 */
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  send(user: User, payload: NotificationPayload): Promise<void>;
}

/** DI token for the array of registered `NotificationProvider`s — see
 * `notifications.module.ts`'s `useFactory`. A plain string token (not a
 * class) because the "value" is an array assembled from several providers,
 * not a single injectable class. */
export const NOTIFICATION_PROVIDERS = 'NOTIFICATION_PROVIDERS';
