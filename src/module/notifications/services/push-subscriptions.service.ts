import { Injectable } from '@nestjs/common';
import { VapidConfigService } from '../config/vapid-config.service';
import { PushSubscriptionRepository } from '../repositories/push-subscription.repository';
import { CreatePushSubscriptionDto } from '../dto/create-push-subscription.dto';

/** Registers/removes a user's browser Web Push subscriptions and exposes
 * the VAPID public key the frontend needs for `pushManager.subscribe`. */
@Injectable()
export class PushSubscriptionsService {
  constructor(
    private readonly vapidConfig: VapidConfigService,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
  ) {}

  /** `null` when push is disabled server-side — the frontend should hide
   * the push opt-in in that case. */
  getPublicKey(): { publicKey: string | null } {
    return { publicKey: this.vapidConfig.publicKey };
  }

  /** Upsert by endpoint; reassigns the endpoint to `userId` if another
   * account had registered the same browser before. */
  async subscribe(
    userId: number,
    dto: CreatePushSubscriptionDto,
  ): Promise<{ ok: true }> {
    await this.pushSubscriptionRepository.upsert({
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: dto.userAgent ?? null,
    });
    return { ok: true };
  }

  /** Idempotent: unknown endpoint, or one owned by another user, is a
   * silent no-op. */
  async unsubscribe(userId: number, endpoint: string): Promise<{ ok: true }> {
    await this.pushSubscriptionRepository.deleteByEndpointForUser(
      userId,
      endpoint,
    );
    return { ok: true };
  }
}
