import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { UserService } from 'src/module/user/user.service';
import {
  NotificationPreferenceRepository,
  NotificationPreferenceToggle,
  NotificationPreferenceToggles,
} from '../repositories/notification-preference.repository';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import {
  CHANNEL_PRIORITY,
  NOTIFICATION_PROVIDERS,
  NotificationPayload,
  NotificationProvider,
} from '../notifications.types';

/** Frontend route where Gmail-detected movements pending review are listed
 * and confirmed (prospero-front `src/pages/expenditures.tsx`). */
export const GMAIL_REVIEW_CTA_PATH = '/expenditures';

/**
 * Which `NotificationPreference` toggle gates each (type, channel) pair. A
 * channel absent for a type is never used for it — e.g. budget alerts have
 * no push toggle yet, so they stay email-only until one is added here (plus
 * its column), with no other change to the dispatcher.
 */
const CHANNEL_TOGGLES: Record<
  NotificationType,
  Partial<Record<NotificationChannel, NotificationPreferenceToggle>>
> = {
  [NotificationType.GmailReviewPending]: {
    [NotificationChannel.Push]: 'gmailReviewPushEnabled',
    [NotificationChannel.Email]: 'gmailReviewEmailEnabled',
  },
  [NotificationType.BudgetThresholdAlert]: {
    [NotificationChannel.Email]: 'budgetAlertEmailEnabled',
  },
};

/**
 * Single entry point every business-level consumer (GmailSyncScheduler
 * today; a future budget-threshold watcher) goes through to notify a user —
 * none of them ever talks to a provider directly. Responsibilities kept
 * here, deliberately not spread across providers:
 * - Resolving the user's per-type, per-channel opt-in/opt-out
 *   (`NotificationPreference`, see `CHANNEL_TOGGLES`).
 * - Channel selection: channels are tried in `CHANNEL_PRIORITY` order (Push,
 *   then Email); the first enabled + eligible (`canDeliver`) channel that
 *   delivers wins and the rest are skipped. So push *replaces* email when it
 *   reaches at least one device, and email is the fallback when push is
 *   off, has no subscriptions, isn't configured, or fails everywhere.
 * - Isolating failures from the caller — a notification that fails to send
 *   must never fail the operation that triggered it (a Gmail sync pass, a
 *   budget recalculation).
 * - Writing the audit trail (`NotificationLog`) for the channel that
 *   actually delivered.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly providersByChannel: ReadonlyMap<
    NotificationChannel,
    NotificationProvider
  >;

  constructor(
    @Inject(NOTIFICATION_PROVIDERS)
    providers: NotificationProvider[],
    private readonly notificationPreferenceRepository: NotificationPreferenceRepository,
    private readonly notificationLogRepository: NotificationLogRepository,
    private readonly userService: UserService,
  ) {
    const byChannel = new Map<NotificationChannel, NotificationProvider>();
    for (const provider of providers) {
      if (!byChannel.has(provider.channel)) {
        byChannel.set(provider.channel, provider);
      }
    }
    this.providersByChannel = byChannel;
  }

  /**
   * Gmail sync detected one or more bank-expense emails that were turned
   * into `Transaction`s with `reviewStatus: PendingReview` — i.e. exactly
   * the set `TransactionsService.countPendingReview`/the review-queue badge
   * already surface. Intentionally scoped to that actionable state only:
   * `ProcessedEmailResult.NeedsReview` rows (unmapped transaction type, no
   * `Transaction` created) have no "review" action in the product today, so
   * notifying about them would point the user at something they can't act
   * on yet — flagged as an open product question rather than guessed at.
   * Called once per sync pass (not per movement).
   */
  async notifyGmailReviewPending(
    userId: number,
    pendingCount: number,
  ): Promise<void> {
    if (pendingCount <= 0) {
      return;
    }

    await this.dispatch(userId, {
      type: NotificationType.GmailReviewPending,
      subject:
        pendingCount === 1
          ? 'Tienes 1 movimiento detectado pendiente de revisión'
          : `Tienes ${pendingCount} movimientos detectados pendientes de revisión`,
      body: 'Detectamos movimientos en tu correo que ya agregamos a tus transacciones, pero todavía no tienen categoría asignada. Revísalos para que se contabilicen correctamente en tu presupuesto.',
      ctaLabel: 'Revisar movimientos',
      ctaPath: GMAIL_REVIEW_CTA_PATH,
      metadata: { pendingCount },
    });
  }

  /** Never throws — see class doc comment. */
  private async dispatch(
    userId: number,
    payload: NotificationPayload,
  ): Promise<void> {
    try {
      const preference =
        await this.notificationPreferenceRepository.findOrDefault(userId);
      const channels = this.enabledChannels(payload.type, preference);
      if (channels.length === 0) {
        return;
      }

      const user = await this.userService.findById(userId);

      for (const channel of channels) {
        const provider = this.providersByChannel.get(channel);
        if (!provider) {
          continue;
        }

        try {
          if (provider.canDeliver && !(await provider.canDeliver(user))) {
            continue;
          }
          await provider.send(user, payload);
        } catch (error) {
          this.logger.error(
            `Failed to send ${payload.type} notification to user ${userId} via ${channel}: ${errorMessage(error)}`,
          );
          continue;
        }

        await this.recordDelivery(userId, payload, channel);
        return;
      }

      this.logger.warn(
        `${payload.type} notification for user ${userId} was not delivered through any channel (tried: ${channels.join(', ')})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to dispatch ${payload.type} notification to user ${userId}: ${errorMessage(error)}`,
      );
    }
  }

  private enabledChannels(
    type: NotificationType,
    preference: NotificationPreferenceToggles,
  ): NotificationChannel[] {
    const toggles = CHANNEL_TOGGLES[type];
    return CHANNEL_PRIORITY.filter((channel) => {
      const toggle = toggles[channel];
      return toggle !== undefined && preference[toggle] === true;
    });
  }

  /** The notification already reached the user: an audit-log failure is
   * logged but must not trigger a fallback (that would double-notify). */
  private async recordDelivery(
    userId: number,
    payload: NotificationPayload,
    channel: NotificationChannel,
  ): Promise<void> {
    try {
      await this.notificationLogRepository.create({
        userId,
        type: payload.type,
        channel,
        subject: payload.subject,
        metadata: payload.metadata,
      });
    } catch (error) {
      this.logger.error(
        `Delivered ${payload.type} to user ${userId} via ${channel} but failed to write NotificationLog: ${errorMessage(error)}`,
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
