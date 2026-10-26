import { Test, TestingModule } from '@nestjs/testing';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from '../services/push-subscriptions.service';

describe('PushSubscriptionsController', () => {
  let controller: PushSubscriptionsController;
  let service: {
    getPublicKey: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      getPublicKey: jest.fn().mockReturnValue({ publicKey: 'BKey' }),
      subscribe: jest.fn().mockResolvedValue({ ok: true }),
      unsubscribe: jest.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PushSubscriptionsController],
      providers: [{ provide: PushSubscriptionsService, useValue: service }],
    }).compile();

    controller = module.get(PushSubscriptionsController);
  });

  it('returns the VAPID public key', () => {
    expect(controller.getVapidPublicKey()).toEqual({ publicKey: 'BKey' });
  });

  it('subscribes for the authenticated user', async () => {
    const dto = {
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'p', auth: 'a' },
    };

    await expect(
      controller.subscribe({ user: { userId: 7 } }, dto),
    ).resolves.toEqual({ ok: true });
    expect(service.subscribe).toHaveBeenCalledWith(7, dto);
  });

  it('unsubscribes for the authenticated user', async () => {
    await expect(
      controller.unsubscribe(
        { user: { userId: 7 } },
        { endpoint: 'https://push.example.com/x' },
      ),
    ).resolves.toEqual({ ok: true });
    expect(service.unsubscribe).toHaveBeenCalledWith(
      7,
      'https://push.example.com/x',
    );
  });
});
