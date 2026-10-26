import { Test, TestingModule } from '@nestjs/testing';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { VapidConfigService } from '../config/vapid-config.service';
import { PushSubscriptionRepository } from '../repositories/push-subscription.repository';

describe('PushSubscriptionsService', () => {
  let service: PushSubscriptionsService;
  let vapidConfig: { publicKey: string | null };
  let repository: { upsert: jest.Mock; deleteByEndpointForUser: jest.Mock };

  beforeEach(async () => {
    vapidConfig = { publicKey: 'BPublicKey' };
    repository = {
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
      deleteByEndpointForUser: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushSubscriptionsService,
        { provide: VapidConfigService, useValue: vapidConfig },
        { provide: PushSubscriptionRepository, useValue: repository },
      ],
    }).compile();

    service = module.get(PushSubscriptionsService);
  });

  it('returns the VAPID public key', () => {
    expect(service.getPublicKey()).toEqual({ publicKey: 'BPublicKey' });
  });

  it('returns a null public key when push is disabled', () => {
    vapidConfig.publicKey = null;
    expect(service.getPublicKey()).toEqual({ publicKey: null });
  });

  it('upserts the subscription for the authenticated user', async () => {
    const result = await service.subscribe(7, {
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p', auth: 'a' },
      userAgent: 'Chrome',
    });

    expect(repository.upsert).toHaveBeenCalledWith({
      userId: 7,
      endpoint: 'https://push.example.com/x',
      p256dh: 'p',
      auth: 'a',
      userAgent: 'Chrome',
    });
    expect(result).toEqual({ ok: true });
  });

  it('stores a null userAgent when none is sent', async () => {
    await service.subscribe(7, {
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p', auth: 'a' },
    });

    expect(repository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: null }),
    );
  });

  it('unsubscribe is scoped to the user and idempotent', async () => {
    repository.deleteByEndpointForUser.mockResolvedValue(0);

    const result = await service.unsubscribe(7, 'https://push.example.com/x');

    expect(repository.deleteByEndpointForUser).toHaveBeenCalledWith(
      7,
      'https://push.example.com/x',
    );
    expect(result).toEqual({ ok: true });
  });
});
