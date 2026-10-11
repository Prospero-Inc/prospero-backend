import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { UserService } from 'src/module/user/user.service';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import {
  NOTIFICATION_PROVIDERS,
  NotificationPayload,
  NotificationProvider,
} from '../notifications.types';

/**
 * Single entry point every business-level consumer (GmailSyncScheduler
 * today; a future budget-threshold watcher) goes through to notify a user —
 * none of them ever talks to `MailNotificationProvider` or any other
 * provider directly. Responsibilities kept here, deliberately not spread
 * across providers:
 * - Resolving the user's per-type opt-in/opt-out (`NotificationPreference`).
 * - Fanning the same payload out to every registered provider.
 * - Isolating one provider's failure from the others, and from the caller —
 *   a notification that fails to send must never fail the operation that
 *   triggered it (a Gmail sync pass, a budget recalculation).
 * - Writing the audit trail (`NotificationLog`) for whatever was actually
 *   delivered.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(NOTIFICATION_PROVIDERS)
    private readonly providers: NotificationProvider[],
    private readonly notificationPreferenceRepository: NotificationPreferenceRepository,
    private readonly notificationLogRepository: NotificationLogRepository,
    private readonly userService: UserService,
  ) {}

  /**
   * Gmail sync detected one or more bank-expense emails that were turned
   * into `Transaction`s with `reviewStatus: PendingReview` — i.e. exactly
   * the set `TransactionsService.countPendingReview`/the review-queue badge
   * already surface. Intentionally scoped to that actionable state only:
   * `ProcessedEmailResult.NeedsReview` rows (unmapped transaction type, no
   * `Transaction` created) have no "review" action in the product today, so
   * notifying about them would point the user at something they can't act
   * on yet — flagged as an open product question rather than guessed at.
   */
  async notifyGmailReviewPending(
    userId: number,
    pendingCount: number,
  ): Promise<void> {
    if (pendingCount <= 0) {
      return;
    }

    const preference =
      await this.notificationPreferenceRepository.findOrDefault(userId);
    if (!preference.gmailReviewEmailEnabled) {
      return;
    }

    const payload: NotificationPayload = {
      type: NotificationType.GmailReviewPending,
      subject:
        pendingCount === 1
          ? 'Tienes 1 movimiento detectado pendiente de revisión'
          : `Tienes ${pendingCount} movimientos detectados pendientes de revisión`,
      body: 'Detectamos movimientos en tu correo que ya agregamos a tus transacciones, pero todavía no tienen categoría asignada. Revísalos para que se contabilicen correctamente en tu presupuesto.',
      ctaLabel: 'Revisar movimientos',
      metadata: { pendingCount },
    };

    await this.dispatch(userId, payload);
  }

  private async dispatch(
    userId: number,
    payload: NotificationPayload,
  ): Promise<void> {
    const user = await this.userService.findById(userId);

    await Promise.all(
      this.providers.map(async (provider) => {
        try {
          await provider.send(user, payload);
          await this.notificationLogRepository.create({
            userId,
            type: payload.type,
            channel: provider.channel,
            subject: payload.subject,
            metadata: payload.metadata,
          });
        } catch (error) {
          // A provider failing to deliver (SMTP down, FCM token stale,
          // whatever a future provider adds) must never bubble up into the
          // caller — see class doc comment. Logged, not re-thrown.
          const message =
            error instanceof Error ? error.message : 'unknown error';
          this.logger.error(
            `Failed to send ${payload.type} notification to user ${userId} via ${provider.channel}: ${message}`,
          );
        }
      }),
    );
  }
}
