import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationType } from '@prisma/client';
import {
  GMAIL_REVIEW_CTA_PATH,
  NotificationsService,
} from './notifications.service';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import { UserService } from 'src/module/user/user.service';
import { NOTIFICATION_PROVIDERS } from '../notifications.types';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let preferenceRepository: { findOrDefault: jest.Mock };
  let logRepository: { create: jest.Mock; findSentSince: jest.Mock };
  let userService: { findById: jest.Mock };
  let mailProvider: { channel: NotificationChannel; send: jest.Mock };
  let pushProvider: {
    channel: NotificationChannel;
    canDeliver: jest.Mock;
    send: jest.Mock;
  };

  const user = { id: 5, email: 'user@example.com', username: 'user' } as any;

  const allEnabled = {
    gmailReviewEmailEnabled: true,
    gmailReviewPushEnabled: true,
    budgetAlertEmailEnabled: true,
    fixedExpenseReminderEnabled: true,
  };

  const buildService = async (providers: unknown[]) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationPreferenceRepository,
          useValue: preferenceRepository,
        },
        { provide: NotificationLogRepository, useValue: logRepository },
        { provide: UserService, useValue: userService },
        { provide: NOTIFICATION_PROVIDERS, useValue: providers },
      ],
    }).compile();
    return module.get<NotificationsService>(NotificationsService);
  };

  beforeEach(async () => {
    preferenceRepository = {
      findOrDefault: jest.fn().mockResolvedValue({ ...allEnabled }),
    };
    logRepository = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findSentSince: jest.fn().mockResolvedValue([]),
    };
    userService = { findById: jest.fn().mockResolvedValue(user) };
    mailProvider = {
      channel: NotificationChannel.Email,
      send: jest.fn().mockResolvedValue(undefined),
    };
    pushProvider = {
      channel: NotificationChannel.Push,
      canDeliver: jest.fn().mockResolvedValue(true),
      send: jest.fn().mockResolvedValue(undefined),
    };

    // Registration order deliberately mail-first: priority must come from
    // CHANNEL_PRIORITY, not array order.
    service = await buildService([mailProvider, pushProvider]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('notifyGmailReviewPending', () => {
    it('does nothing when there is nothing pending', async () => {
      await service.notifyGmailReviewPending(5, 0);

      expect(preferenceRepository.findOrDefault).not.toHaveBeenCalled();
      expect(userService.findById).not.toHaveBeenCalled();
      expect(mailProvider.send).not.toHaveBeenCalled();
      expect(pushProvider.send).not.toHaveBeenCalled();
    });

    it('sends only push when push is eligible and delivers', async () => {
      await service.notifyGmailReviewPending(5, 2);

      expect(pushProvider.canDeliver).toHaveBeenCalledWith(user);
      expect(pushProvider.send).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          type: NotificationType.GmailReviewPending,
          subject: expect.stringContaining('2'),
          ctaPath: GMAIL_REVIEW_CTA_PATH,
        }),
      );
      expect(mailProvider.send).not.toHaveBeenCalled();
      expect(logRepository.create).toHaveBeenCalledTimes(1);
      expect(logRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 5,
          type: NotificationType.GmailReviewPending,
          channel: NotificationChannel.Push,
          metadata: { pendingCount: 2 },
        }),
      );
    });

    it('falls back to email when push fails on every device', async () => {
      pushProvider.send.mockRejectedValue(new Error('not delivered'));

      await service.notifyGmailReviewPending(5, 2);

      expect(pushProvider.send).toHaveBeenCalled();
      expect(mailProvider.send).toHaveBeenCalled();
      expect(logRepository.create).toHaveBeenCalledTimes(1);
      expect(logRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: NotificationChannel.Email }),
      );
    });

    it('falls back to email when the user has no push subscriptions', async () => {
      pushProvider.canDeliver.mockResolvedValue(false);

      await service.notifyGmailReviewPending(5, 2);

      expect(pushProvider.send).not.toHaveBeenCalled();
      expect(mailProvider.send).toHaveBeenCalled();
      expect(logRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: NotificationChannel.Email }),
      );
    });

    it('falls back to email when the eligibility check itself throws', async () => {
      pushProvider.canDeliver.mockRejectedValue(new Error('db down'));

      await service.notifyGmailReviewPending(5, 2);

      expect(pushProvider.send).not.toHaveBeenCalled();
      expect(mailProvider.send).toHaveBeenCalled();
    });

    it('uses email when the user disabled push for this type', async () => {
      preferenceRepository.findOrDefault.mockResolvedValue({
        ...allEnabled,
        gmailReviewPushEnabled: false,
      });

      await service.notifyGmailReviewPending(5, 2);

      expect(pushProvider.canDeliver).not.toHaveBeenCalled();
      expect(pushProvider.send).not.toHaveBeenCalled();
      expect(mailProvider.send).toHaveBeenCalled();
    });

    it('does not fall back to email when email is disabled', async () => {
      preferenceRepository.findOrDefault.mockResolvedValue({
        ...allEnabled,
        gmailReviewEmailEnabled: false,
      });
      pushProvider.send.mockRejectedValue(new Error('not delivered'));

      await service.notifyGmailReviewPending(5, 2);

      expect(pushProvider.send).toHaveBeenCalled();
      expect(mailProvider.send).not.toHaveBeenCalled();
      expect(logRepository.create).not.toHaveBeenCalled();
    });

    it('sends nothing when both channels are disabled', async () => {
      preferenceRepository.findOrDefault.mockResolvedValue({
        ...allEnabled,
        gmailReviewEmailEnabled: false,
        gmailReviewPushEnabled: false,
      });

      await service.notifyGmailReviewPending(5, 2);

      expect(userService.findById).not.toHaveBeenCalled();
      expect(pushProvider.canDeliver).not.toHaveBeenCalled();
      expect(pushProvider.send).not.toHaveBeenCalled();
      expect(mailProvider.send).not.toHaveBeenCalled();
      expect(logRepository.create).not.toHaveBeenCalled();
    });

    it('singularizes the subject when there is exactly one pending item', async () => {
      await service.notifyGmailReviewPending(5, 1);

      expect(pushProvider.send).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ subject: expect.stringContaining('1') }),
      );
    });

    it('works with only the email provider registered', async () => {
      const emailOnly = await buildService([mailProvider]);

      await emailOnly.notifyGmailReviewPending(5, 2);

      expect(mailProvider.send).toHaveBeenCalled();
      expect(logRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ channel: NotificationChannel.Email }),
      );
    });

    it('swallows a failure of every channel instead of re-throwing', async () => {
      pushProvider.send.mockRejectedValue(new Error('push down'));
      mailProvider.send.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.notifyGmailReviewPending(5, 2),
      ).resolves.toBeUndefined();
      expect(logRepository.create).not.toHaveBeenCalled();
    });

    it('swallows preference/user lookup failures', async () => {
      userService.findById.mockRejectedValue(new Error('no user'));

      await expect(
        service.notifyGmailReviewPending(5, 2),
      ).resolves.toBeUndefined();

      preferenceRepository.findOrDefault.mockRejectedValue(new Error('db'));
      await expect(
        service.notifyGmailReviewPending(5, 2),
      ).resolves.toBeUndefined();
      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    it('does not fall back (double-notify) when only the audit log write fails', async () => {
      logRepository.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.notifyGmailReviewPending(5, 2),
      ).resolves.toBeUndefined();
      expect(pushProvider.send).toHaveBeenCalledTimes(1);
      expect(mailProvider.send).not.toHaveBeenCalled();
    });
  });

  describe('notifyFixedExpensesDue', () => {
    const occurrence = new Date('2026-11-30T00:00:00.000Z');
    const contabo = { id: 1, name: 'Contabo', amount: 15 };
    const energia = { id: 2, name: 'Energía', amount: 40.5 };

    it('names the bill and links to the fixed expenses screen', async () => {
      await service.notifyFixedExpensesDue(5, occurrence, [contabo]);

      expect(pushProvider.send).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          type: NotificationType.FixedExpenseReminder,
          subject: 'Contabo vence hoy',
          body: expect.stringContaining('Contabo $15.00'),
          ctaPath: '/fixed-expenses',
        }),
      );
      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    it('sends one notification for several bills due the same day', async () => {
      await service.notifyFixedExpensesDue(5, occurrence, [contabo, energia]);

      expect(pushProvider.send).toHaveBeenCalledTimes(1);
      expect(pushProvider.send).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          subject: '2 gastos fijos vencen hoy',
          body: expect.stringContaining('Contabo $15.00, Energía $40.50'),
        }),
      );
    });

    it('does not repeat what was already sent for this occurrence', async () => {
      logRepository.findSentSince.mockResolvedValue([
        { metadata: { occurrence: '2026-11-30', fixedExpenseIds: [1] } },
      ]);

      await service.notifyFixedExpensesDue(5, occurrence, [contabo]);

      expect(pushProvider.send).not.toHaveBeenCalled();
      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    it('ignores what was sent for another occurrence', async () => {
      logRepository.findSentSince.mockResolvedValue([
        { metadata: { occurrence: '2026-10-30', fixedExpenseIds: [1] } },
      ]);

      await service.notifyFixedExpensesDue(5, occurrence, [contabo]);

      expect(pushProvider.send).toHaveBeenCalledTimes(1);
    });

    it('records what it sent, so a second run can skip it', async () => {
      await service.notifyFixedExpensesDue(5, occurrence, [contabo]);

      expect(logRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.FixedExpenseReminder,
          metadata: { occurrence: '2026-11-30', fixedExpenseIds: [1] },
        }),
      );
    });

    it('sends nothing on any channel when reminders are off', async () => {
      preferenceRepository.findOrDefault.mockResolvedValue({
        ...allEnabled,
        fixedExpenseReminderEnabled: false,
      });

      await service.notifyFixedExpensesDue(5, occurrence, [contabo]);

      expect(pushProvider.send).not.toHaveBeenCalled();
      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    it('falls back to email only if the email fallback is on', async () => {
      pushProvider.canDeliver.mockResolvedValue(false);

      await service.notifyFixedExpensesDue(5, occurrence, [contabo]);
      expect(mailProvider.send).toHaveBeenCalledTimes(1);

      mailProvider.send.mockClear();
      preferenceRepository.findOrDefault.mockResolvedValue({
        ...allEnabled,
        gmailReviewEmailEnabled: false,
      });

      await service.notifyFixedExpensesDue(5, occurrence, [contabo]);
      expect(mailProvider.send).not.toHaveBeenCalled();
    });
  });
});
