import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePushSubscriptionDto } from './create-push-subscription.dto';
import { UnsubscribePushDto } from './unsubscribe-push.dto';

// Mirrors the global I18nValidationPipe options in main.ts.
const validateBody = async <T extends object>(
  cls: new () => T,
  body: unknown,
) => {
  const instance = plainToInstance(cls, body, {
    enableImplicitConversion: true,
  });
  return validate(instance, { whitelist: true, forbidNonWhitelisted: true });
};

const validBody = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BNcRdreALRFX', auth: 'tBHItJI5svbpez7KI4CCXg' },
  userAgent: 'Mozilla/5.0',
};

describe('CreatePushSubscriptionDto', () => {
  it('accepts a valid subscription', async () => {
    await expect(
      validateBody(CreatePushSubscriptionDto, validBody),
    ).resolves.toHaveLength(0);
  });

  it('accepts the raw PushSubscription.toJSON() shape (expirationTime: null)', async () => {
    await expect(
      validateBody(CreatePushSubscriptionDto, {
        endpoint: validBody.endpoint,
        expirationTime: null,
        keys: validBody.keys,
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects a non-https endpoint', async () => {
    const errors = await validateBody(CreatePushSubscriptionDto, {
      ...validBody,
      endpoint: 'http://push.example.com/x',
    });
    expect(errors.map((e) => e.property)).toContain('endpoint');
  });

  it('rejects a non-URL endpoint', async () => {
    const errors = await validateBody(CreatePushSubscriptionDto, {
      ...validBody,
      endpoint: 'not a url',
    });
    expect(errors.map((e) => e.property)).toContain('endpoint');
  });

  it('rejects missing keys', async () => {
    const errors = await validateBody(CreatePushSubscriptionDto, {
      endpoint: validBody.endpoint,
    });
    expect(errors.map((e) => e.property)).toContain('keys');
  });

  it('validates the nested keys object', async () => {
    const errors = await validateBody(CreatePushSubscriptionDto, {
      ...validBody,
      keys: { p256dh: '' },
    });
    const keysError = errors.find((e) => e.property === 'keys');
    expect(keysError?.children?.map((c) => c.property).sort()).toEqual([
      'auth',
      'p256dh',
    ]);
  });

  it('rejects unknown properties', async () => {
    const errors = await validateBody(CreatePushSubscriptionDto, {
      ...validBody,
      userId: 99,
    });
    expect(errors.map((e) => e.property)).toContain('userId');
  });
});

describe('UnsubscribePushDto', () => {
  it('requires a non-empty endpoint', async () => {
    await expect(
      validateBody(UnsubscribePushDto, { endpoint: validBody.endpoint }),
    ).resolves.toHaveLength(0);
    const errors = await validateBody(UnsubscribePushDto, { endpoint: '' });
    expect(errors.map((e) => e.property)).toContain('endpoint');
  });
});
