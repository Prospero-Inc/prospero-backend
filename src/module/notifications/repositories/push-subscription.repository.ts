import { Injectable } from '@nestjs/common';
import { PushSubscription } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

export interface UpsertPushSubscriptionData {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

/**
 * Browser Web Push subscriptions, many per user (one per browser/device).
 * `endpoint` is the natural key: it's unique per browser subscription, so
 * re-subscribing the same browser is an update, not a new row.
 */
@Injectable()
export class PushSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: number): Promise<PushSubscription[]> {
    return this.prisma.pushSubscription.findMany({ where: { userId } });
  }

  countByUserId(userId: number): Promise<number> {
    return this.prisma.pushSubscription.count({ where: { userId } });
  }

  /** Upsert by `endpoint`. If the endpoint already belongs to another user
   * (same browser, different Prospero account logged in), it is reassigned
   * to `data.userId` — a browser subscription can only ever notify the
   * account currently using it. */
  upsert(data: UpsertPushSubscriptionData): Promise<PushSubscription> {
    const fields = {
      userId: data.userId,
      p256dh: data.p256dh,
      auth: data.auth,
      userAgent: data.userAgent ?? null,
    };
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: { endpoint: data.endpoint, ...fields },
      update: fields,
    });
  }

  /** Deletes the subscription only if it belongs to `userId`. `deleteMany`
   * (not `delete`) so a missing row is a no-op, not a P2025 error. */
  async deleteByEndpointForUser(
    userId: number,
    endpoint: string,
  ): Promise<number> {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return result.count;
  }

  /** Used when the push service reports the subscription gone (404/410). */
  async deleteById(id: number): Promise<number> {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { id },
    });
    return result.count;
  }
}
