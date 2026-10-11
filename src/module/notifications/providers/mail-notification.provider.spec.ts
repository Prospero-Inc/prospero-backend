import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { MailNotificationProvider } from './mail-notification.provider';
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
});
