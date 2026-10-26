import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationType } from '@prisma/client';
import * as webpush from 'web-push';
import {
  PUSH_TTL_SECONDS,
  PushNotificationProvider,
} from './push-notification.provider';
import { VapidConfigService } from '../config/vapid-config.service';
import { PushSubscriptionRepository } from '../repositories/push-subscription.repository';
import { NotificationPayload } from '../notifications.types';

jest.mock('web-push', () => ({ sendNotification: jest.fn() }));

const sendNotification = webpush.sendNotification as jest.Mock;

describe('PushNotificationProvider', () => {
  let provider: PushNotificationProvider;
  let vapidConfig: { isEnabled: boolean; getDetails: jest.Mock };
  let repository: {
    countByUserId: jest.Mock;
    findByUserId: jest.Mock;
    deleteById: jest.Mock;
  };

  const user = { id: 5, email: 'user@example.com' } as any;
  const vapidDetails = {
    subject: 'mailto:soporte@example.com',
    publicKey: 'pub',
    privateKey: 'priv',
  };
  const subscriptionA = {
    id: 1,
    userId: 5,
    endpoint: 'https://push.example.com/a',
    p256dh: 'p256dh-a',
    auth: 'auth-a',
  };
  const subscriptionB = {
    id: 2,
    userId: 5,
    endpoint: 'https://push.example.com/b',
    p256dh: 'p256dh-b',
    auth: 'auth-b',
  };
  const payload: NotificationPayload = {
    type: NotificationType.GmailReviewPending,
    subject: 'Tienes 2 movimientos detectados pendientes de revisión',
    body: 'Revísalos.',
    ctaPath: '/expenditures',
  };

  const webPushError = (statusCode: number) =>
    Object.assign(new Error(`Received unexpected response code`), {
      statusCode,
    });

  beforeEach(async () => {
    sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
    vapidConfig = {
      isEnabled: true,
      getDetails: jest.fn().mockReturnValue(vapidDetails),
    };
    repository = {
      countByUserId: jest.fn().mockResolvedValue(2),
      findByUserId: jest.fn().mockResolvedValue([subscriptionA, subscriptionB]),
      deleteById: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationProvider,
        { provide: VapidConfigService, useValue: vapidConfig },
        { provide: PushSubscriptionRepository, useValue: repository },
      ],
    }).compile();

    provider = module.get(PushNotificationProvider);
  });

  it('exposes the Push channel', () => {
    expect(provider.channel).toBe(NotificationChannel.Push);
  });

  describe('canDeliver', () => {
    it('is true with VAPID configured and at least one subscription', async () => {
      await expect(provider.canDeliver(user)).resolves.toBe(true);
      expect(repository.countByUserId).toHaveBeenCalledWith(5);
    });

    it('is false without subscriptions', async () => {
      repository.countByUserId.mockResolvedValue(0);
      await expect(provider.canDeliver(user)).resolves.toBe(false);
    });

    it('is false when VAPID is not configured, without hitting the DB', async () => {
      vapidConfig.isEnabled = false;
      await expect(provider.canDeliver(user)).resolves.toBe(false);
      expect(repository.countByUserId).not.toHaveBeenCalled();
    });
  });

  describe('send', () => {
    it('sends the JSON payload to every subscription with VAPID + TTL', async () => {
      await provider.send(user, payload);

      expect(sendNotification).toHaveBeenCalledTimes(2);
      const [subscription, body, options] = sendNotification.mock.calls[0];
      expect(subscription).toEqual({
        endpoint: subscriptionA.endpoint,
        keys: { p256dh: 'p256dh-a', auth: 'auth-a' },
      });
      expect(JSON.parse(body)).toEqual({
        title: payload.subject,
        body: payload.body,
        url: '/expenditures',
        tag: 'gmail-review',
      });
      expect(options).toEqual(
        expect.objectContaining({ vapidDetails, TTL: PUSH_TTL_SECONDS }),
      );
    });

    it('succeeds if at least one device accepted it', async () => {
      sendNotification
        .mockRejectedValueOnce(webPushError(500))
        .mockResolvedValueOnce({ statusCode: 201 });

      await expect(provider.send(user, payload)).resolves.toBeUndefined();
      expect(repository.deleteById).not.toHaveBeenCalled();
    });

    it.each([404, 410])(
      'deletes a subscription the push service reports as gone (%i)',
      async (statusCode) => {
        sendNotification
          .mockRejectedValueOnce(webPushError(statusCode))
          .mockResolvedValueOnce({ statusCode: 201 });

        await provider.send(user, payload);

        expect(repository.deleteById).toHaveBeenCalledTimes(1);
        expect(repository.deleteById).toHaveBeenCalledWith(subscriptionA.id);
      },
    );

    it('throws when no device received it (all gone → all deleted)', async () => {
      sendNotification.mockRejectedValue(webPushError(410));

      await expect(provider.send(user, payload)).rejects.toThrow(
        /not delivered/,
      );
      expect(repository.deleteById).toHaveBeenCalledTimes(2);
    });

    it('throws when every device fails with a transient error, keeping the rows', async () => {
      sendNotification.mockRejectedValue(new Error('ECONNRESET'));

      await expect(provider.send(user, payload)).rejects.toThrow(
        /not delivered/,
      );
      expect(repository.deleteById).not.toHaveBeenCalled();
    });

    it('still reports failure if deleting a stale subscription fails', async () => {
      sendNotification.mockRejectedValue(webPushError(404));
      repository.deleteById.mockRejectedValue(new Error('db down'));

      await expect(provider.send(user, payload)).rejects.toThrow(
        /not delivered/,
      );
    });

    it('throws when the user has no subscriptions', async () => {
      repository.findByUserId.mockResolvedValue([]);

      await expect(provider.send(user, payload)).rejects.toThrow(
        /no push subscriptions/,
      );
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('throws without sending when VAPID is not configured', async () => {
      vapidConfig.getDetails.mockReturnValue(null);

      await expect(provider.send(user, payload)).rejects.toThrow(/disabled/);
      expect(repository.findByUserId).not.toHaveBeenCalled();
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it('defaults the url to the app root when no ctaPath is given', async () => {
      await provider.send(user, { ...payload, ctaPath: undefined });

      const body = JSON.parse(sendNotification.mock.calls[0][1]);
      expect(body.url).toBe('/');
    });
  });
});
