import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationType } from '@prisma/client';
import {
  MailNotificationProvider,
  resolveCtaUrl,
} from './mail-notification.provider';
import { MailService } from 'src/module/mail/mail.service';

describe('MailNotificationProvider', () => {
  let provider: MailNotificationProvider;
  let mailService: { sendNotificationEmail: jest.Mock };

  const user = { id: 5, email: 'user@example.com', username: 'user' } as any;

  beforeEach(async () => {
    mailService = {
      sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailNotificationProvider,
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    provider = module.get<MailNotificationProvider>(MailNotificationProvider);
  });

  it('exposes the Email channel', () => {
    expect(provider.channel).toBe(NotificationChannel.Email);
  });

  it('translates the payload into a notification email', async () => {
    await provider.send(user, {
      type: NotificationType.GmailReviewPending,
      subject: 'Tienes 2 movimientos pendientes de revisión',
      body: 'Revísalos cuando puedas.',
      ctaUrl: 'https://app.prospero.com/transactions',
      ctaLabel: 'Revisar movimientos',
    });

    expect(mailService.sendNotificationEmail).toHaveBeenCalledWith(user, {
      subject: 'Tienes 2 movimientos pendientes de revisión',
      body: 'Revísalos cuando puedas.',
      ctaUrl: 'https://app.prospero.com/transactions',
      ctaLabel: 'Revisar movimientos',
    });
  });

  it('builds the email link from ctaPath and APP_BASE_URL', async () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = 'https://app.prospero.com/';

    try {
      await provider.send(user, {
        type: NotificationType.GmailReviewPending,
        subject: 'Pendientes',
        body: 'Revísalos cuando puedas.',
        ctaPath: '/review',
        ctaLabel: 'Revisar movimientos',
      });
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previous;
    }

    expect(mailService.sendNotificationEmail).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        ctaUrl: 'https://app.prospero.com/review',
      }),
    );
  });

  describe('resolveCtaUrl', () => {
    const base = 'https://app.prospero.com';

    it('prefers an explicit ctaUrl over ctaPath', () => {
      expect(
        resolveCtaUrl(
          { ctaUrl: 'https://elsewhere.com/x', ctaPath: '/review' },
          base,
        ),
      ).toBe('https://elsewhere.com/x');
    });

    it.each([
      ['https://app.prospero.com', '/review'],
      ['https://app.prospero.com/', '/review'],
      ['https://app.prospero.com', 'review'],
      ['https://app.prospero.com/', 'review'],
    ])('joins %s and %s with exactly one slash', (appBaseUrl, ctaPath) => {
      expect(resolveCtaUrl({ ctaPath }, appBaseUrl)).toBe(
        'https://app.prospero.com/review',
      );
    });

    it('returns undefined without a base url', () => {
      expect(resolveCtaUrl({ ctaPath: '/review' }, '')).toBeUndefined();
    });

    it('returns undefined without a path', () => {
      expect(resolveCtaUrl({}, base)).toBeUndefined();
    });
  });
});
