import { Injectable } from '@nestjs/common';
import { NotificationPreference, Prisma } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

/** Every per-type, per-channel opt-in toggle stored on
 * `NotificationPreference`. */
export type NotificationPreferenceToggle =
  | 'gmailReviewEmailEnabled'
  | 'gmailReviewPushEnabled'
  | 'budgetAlertEmailEnabled';

/** Effective (fully resolved) toggles for a user. */
export type NotificationPreferenceToggles = Pick<
  NotificationPreference,
  NotificationPreferenceToggle
>;

/** Kept separate from the public DTO so the repository layer doesn't import
 * from `dto/`, consistent with `TransactionsRepository`/
 * `FixedExpensesRepository` taking their own narrow input types. */
export type NotificationPreferenceUpsertData =
  Partial<NotificationPreferenceToggles>;

/**
 * No row for a given user is a valid, common state (every user starts
 * without one) — it means "all defaults enabled", not "unset". Callers
 * needing the effective preference should go through
 * `NotificationPreferenceRepository.findOrDefault` below rather than
 * `findByUserId` directly, to avoid re-deriving the default shape in every
 * caller.
 */
const DEFAULT_PREFERENCE: NotificationPreferenceToggles = {
  gmailReviewEmailEnabled: true,
  gmailReviewPushEnabled: true,
  budgetAlertEmailEnabled: true,
};

@Injectable()
export class NotificationPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: number): Promise<NotificationPreference | null> {
    return this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
  }

  /** Effective preference for a user, materializing the all-enabled
   * default in memory (never persisted) when no row exists yet. */
  async findOrDefault(userId: number): Promise<NotificationPreferenceToggles> {
    const existing = await this.findByUserId(userId);
    return existing ?? { ...DEFAULT_PREFERENCE };
  }

  upsert(
    userId: number,
    data: NotificationPreferenceUpsertData,
  ): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCE, ...data },
      update: data as Prisma.NotificationPreferenceUpdateInput,
    });
  }
}
