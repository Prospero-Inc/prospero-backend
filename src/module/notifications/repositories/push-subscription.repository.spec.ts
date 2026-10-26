import { PushSubscriptionRepository } from './push-subscription.repository';

describe('PushSubscriptionRepository', () => {
  let prisma: {
    pushSubscription: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let repository: PushSubscriptionRepository;

  beforeEach(() => {
    prisma = {
      pushSubscription: {
        upsert: jest.fn().mockResolvedValue({ id: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    repository = new PushSubscriptionRepository(prisma as any);
  });

  it('upserts by endpoint and (re)assigns the row to the given user', async () => {
    await repository.upsert({
      userId: 9,
      endpoint: 'https://push.example.com/x',
      p256dh: 'p',
      auth: 'a',
      userAgent: 'Firefox',
    });

    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example.com/x' },
      create: {
        endpoint: 'https://push.example.com/x',
        userId: 9,
        p256dh: 'p',
        auth: 'a',
        userAgent: 'Firefox',
      },
      // userId in `update` is what moves an endpoint previously owned by
      // another account over to the current one.
      update: { userId: 9, p256dh: 'p', auth: 'a', userAgent: 'Firefox' },
    });
  });

  it('only deletes a subscription owned by the given user', async () => {
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });

    const count = await repository.deleteByEndpointForUser(
      9,
      'https://push.example.com/x',
    );

    expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { userId: 9, endpoint: 'https://push.example.com/x' },
    });
    expect(count).toBe(0);
  });

  it('deleteById is a no-op (not an error) for an already-deleted row', async () => {
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.deleteById(3)).resolves.toBe(0);
  });
});
