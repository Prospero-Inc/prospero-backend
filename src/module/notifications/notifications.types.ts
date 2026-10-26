import { NotificationChannel, NotificationType, User } from '@prisma/client';

/**
 * Channel-agnostic description of a single notification. Business-level
 * callers (GmailSyncScheduler today, a future budget-threshold watcher)
 * build one of these and hand it to `NotificationsService` — they never
 * import a specific provider (Mail, Push) directly. This is the seam that
 * keeps "what happened" (a Gmail sync created 3 reviewable transactions)
 * decoupled from "how the user is told" (push if they have a subscribed
 * browser, email otherwise / as fallback).
 */
export interface NotificationPayload {
  readonly type: NotificationType;
  readonly subject: string;
  readonly body: string;
  /** Optional absolute deep link into the frontend, e.g. the transactions
   * list filtered to pending review. Used by the email channel. */
  readonly ctaUrl?: string;
  readonly ctaLabel?: string;
  /** Optional frontend route relative to the app origin (e.g.
   * `/expenditures`). Used by the push channel: the service worker resolves
   * it against its own origin on `notificationclick`, so the backend never
   * needs to know the frontend's public URL for push. */
  readonly ctaPath?: string;
  /** Freeform data worth keeping on the `NotificationLog` audit row for
   * later debugging/analytics (e.g. `{ pendingCount: 3 }`) — never used to
   * render the message itself, that's `subject`/`body`. */
  readonly metadata?: Record<string, unknown>;
}

/**
 * One implementation per delivery channel: `MailNotificationProvider`
 * (Email) and `PushNotificationProvider` (standard Web Push with VAPID via
 * the `web-push` npm package — deliberately no Firebase/FCM). Both are
 * registered under the `NOTIFICATION_PROVIDERS` token in
 * `notifications.module.ts`.
 *
 * `NotificationsService` decides *which* channel to use for a given user
 * and type (per-type `NotificationPreference` toggles + `canDeliver`), in
 * the priority order of `CHANNEL_PRIORITY` (Push first, Email as fallback):
 * the first channel that delivers wins, and a channel whose `send` throws
 * falls through to the next one. A provider never decides on its own
 * whether to send — that's the dispatcher's job — it only reports whether
 * it *can* (e.g. push needs VAPID configured and ≥1 subscription).
 *
 * Adding a new channel means: a provider implementing this interface, a
 * new `NotificationChannel` enum value, its slot in `CHANNEL_PRIORITY` and
 * in `NotificationsService`'s per-type preference map, and registering it
 * in the module's factory. No change to business callers.
 */
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  /** Whether this channel can reach the user at all right now (configured,
   * has a device/address). Omitted ⇒ always eligible (e.g. email — every
   * user has one). */
  canDeliver?(user: User): Promise<boolean>;
  /** Must throw if the notification was not delivered, so the dispatcher
   * can fall back to the next channel. */
  send(user: User, payload: NotificationPayload): Promise<void>;
}

/** Order in which `NotificationsService` tries channels — the first one
 * that is enabled, eligible, and delivers successfully wins. */
export const CHANNEL_PRIORITY: readonly NotificationChannel[] = [
  NotificationChannel.Push,
  NotificationChannel.Email,
];

/** DI token for the array of registered `NotificationProvider`s — see
 * `notifications.module.ts`'s `useFactory`. A plain string token (not a
 * class) because the "value" is an array assembled from several providers,
 * not a single injectable class. */
export const NOTIFICATION_PROVIDERS = 'NOTIFICATION_PROVIDERS';
