import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerStorage } from '@nestjs/throttler';
import { I18nService } from 'nestjs-i18n';
import { ShortcutTokenThrottleGuard } from './shortcut-token-throttle.guard';

const contextFor = (authorization?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  }) as unknown as ExecutionContext;

/** In-memory storage with the same blocking contract (hits > limit). */
function fakeStorage(): ThrottlerStorage {
  const hits = new Map<string, number>();
  return {
    increment: async (key: string, ttl: number, limit: number) => {
      const total = (hits.get(key) ?? 0) + 1;
      hits.set(key, total);
      return {
        totalHits: total,
        timeToExpire: ttl,
        isBlocked: total > limit,
        timeToBlockExpire: total > limit ? ttl : 0,
      };
    },
  };
}

describe('ShortcutTokenThrottleGuard', () => {
  const i18n = { t: jest.fn().mockReturnValue('Esperá un minuto') };
  let guard: ShortcutTokenThrottleGuard;

  beforeEach(() => {
    guard = new ShortcutTokenThrottleGuard(
      fakeStorage(),
      i18n as unknown as I18nService,
    );
  });

  it('allows 30 requests per token per window and blocks the 31st', async () => {
    for (let i = 0; i < 30; i += 1) {
      await expect(
        guard.canActivate(contextFor('Bearer prs_one')),
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(contextFor('Bearer prs_one')),
    ).rejects.toBeInstanceOf(ThrottlerException);
  });

  it('counts each token separately', async () => {
    for (let i = 0; i < 31; i += 1) {
      await guard.canActivate(contextFor('Bearer prs_one')).catch(() => null);
    }
    await expect(guard.canActivate(contextFor('Bearer prs_two'))).resolves.toBe(
      true,
    );
  });

  it('lets requests without a Shortcuts token through to the auth guard', async () => {
    await expect(guard.canActivate(contextFor())).resolves.toBe(true);
    await expect(guard.canActivate(contextFor('Bearer eyJ.a.b'))).resolves.toBe(
      true,
    );
  });
});
