import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import { LoginEmailThrottleGuard } from './login-email-throttle.guard';
import { LOGIN_EMAIL_LIMIT } from '../auth.constants';

describe('LoginEmailThrottleGuard', () => {
  let storage: ThrottlerStorageService;
  let guard: LoginEmailThrottleGuard;

  const contextFor = (body: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ body }) }),
    }) as unknown as ExecutionContext;

  const attempt = (email: unknown) => guard.canActivate(contextFor({ email }));

  beforeEach(() => {
    storage = new ThrottlerStorageService();
    guard = new LoginEmailThrottleGuard(storage);
  });

  afterEach(() => storage.onApplicationShutdown());

  it(`allows ${LOGIN_EMAIL_LIMIT} attempts per email and blocks the next one`, async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT; i++) {
      await expect(attempt('ana@example.com')).resolves.toBe(true);
    }

    await expect(attempt('ana@example.com')).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('counts the same email regardless of case and spacing', async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT; i++) {
      await attempt(i % 2 ? 'Ana@Example.com ' : 'ana@example.com');
    }

    await expect(attempt(' ANA@example.COM')).rejects.toBeInstanceOf(
      ThrottlerException,
    );
  });

  it('does not let one email exhaust the limit of another', async () => {
    for (let i = 0; i < LOGIN_EMAIL_LIMIT + 1; i++) {
      await attempt('ana@example.com').catch(() => undefined);
    }

    await expect(attempt('luis@example.com')).resolves.toBe(true);
  });

  it('leaves a missing email to the validation pipe', async () => {
    await expect(guard.canActivate(contextFor({}))).resolves.toBe(true);
  });
});
