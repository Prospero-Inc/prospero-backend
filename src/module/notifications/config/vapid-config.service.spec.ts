import { Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { VapidConfigService } from './vapid-config.service';

describe('VapidConfigService', () => {
  const originalEnv = process.env;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    warnSpy.mockRestore();
  });

  it('is enabled with a valid key pair and subject', () => {
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = 'mailto:soporte@example.com';

    const config = new VapidConfigService();

    expect(config.isEnabled).toBe(true);
    expect(config.publicKey).toBe(keys.publicKey);
    expect(config.getDetails()).toEqual({
      subject: 'mailto:soporte@example.com',
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('is disabled (one warning, no throw) when env vars are missing', () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;

    const config = new VapidConfigService();

    expect(config.isEnabled).toBe(false);
    expect(config.publicKey).toBeNull();
    expect(config.getDetails()).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('is disabled (one warning, no throw) when the keys are malformed', () => {
    process.env.VAPID_PUBLIC_KEY = 'not-a-key';
    process.env.VAPID_PRIVATE_KEY = 'not-a-key';
    process.env.VAPID_SUBJECT = 'mailto:soporte@example.com';

    const config = new VapidConfigService();

    expect(config.isEnabled).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
