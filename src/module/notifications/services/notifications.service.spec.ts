import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';
import { NotificationLogRepository } from '../repositories/notification-log.repository';
import { UserService } from 'src/module/user/user.service';
import { NOTIFICATION_PROVIDERS } from '../notifications.types';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let preferenceRepository: { findOrDefault: jest.Mock };
  let logRepository: { create: jest.Mock };
  let userService: { findById: jest.Mock };
  let mailProvider: { channel: NotificationChannel; send: jest.Mock };

  const user = { id: 5, email: 'user@example.com', username: 'user' } as any;

  beforeEach(async () => {
    preferenceRepository = {
      findOrDefault: jest.fn().mockResolvedValue({
        gmailReviewEmailEnabled: true,
        budgetAlertEmailEnabled: true,
      }),
    };
    logRepository = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    userService = { findById: jest.fn().mockResolvedValue(user) };
    mailProvider = {
      channel: NotificationChannel.Email,
      send: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationPreferenceRepository,
          useValue: preferenceRepository,
        },
        { provide: NotificationLogRepository, useValue: logRepository },
        { provide: UserService, useValue: userService },
        { provide: NOTIFICATION_PROVIDERS, useValue: [mailProvider] },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('notifyGmailReviewPending', () => {
    it('does nothing when there is nothing pending', async () => {
      await service.notifyGmailReviewPending(5, 0);

      expect(userService.findById).not.toHaveBeenCalled();
      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    it('respects the user opting out of this notification type', async () => {
      preferenceRepository.findOrDefault.mockResolvedValue({
        gmailReviewEmailEnabled: false,
        budgetAlertEmailEnabled: true,
      });

      await service.notifyGmailReviewPending(5, 2);

      expect(mailProvider.send).not.toHaveBeenCalled();
    });

    it('dispatches to every registered provider and logs the delivery', async () => {
      await service.notifyGmailReviewPending(5, 2);

      expect(userService.findById).toHaveBeenCalledWith(5);
      expect(mailProvider.send).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          type: NotificationType.GmailReviewPending,
          subject: expect.stringContaining('2'),
        }),
      );
      expect(logRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 5,
          type: NotificationType.GmailReviewPending,
          channel: NotificationChannel.Email,
        }),
      );
    });

    it('singularizes the subject when there is exactly one pending item', async () => {
      await service.notifyGmailReviewPending(5, 1);

      expect(mailProvider.send).toHaveBeenCalledWith(
        user,
        expect.objectContaining({ subject: expect.stringContaining('1') }),
      );
    });

    it('a provider failure is logged and swallowed, not re-thrown', async () => {
      mailProvider.send.mockRejectedValue(new Error('smtp down'));

      await expect(
        service.notifyGmailReviewPending(5, 2),
      ).resolves.toBeUndefined();
      expect(logRepository.create).not.toHaveBeenCalled();
    });

    it('one provider failing does not prevent another provider from being tried', async () => {
      const brokenProvider = {
        channel: NotificationChannel.Email,
        send: jest.fn().mockRejectedValue(new Error('down')),
      };
      const workingProvider = {
        channel: NotificationChannel.Email,
        send: jest.fn().mockResolvedValue(undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NotificationsService,
          {
            provide: NotificationPreferenceRepository,
            useValue: preferenceRepository,
          },
          { provide: NotificationLogRepository, useValue: logRepository },
          { provide: UserService, useValue: userService },
          {
            provide: NOTIFICATION_PROVIDERS,
            useValue: [brokenProvider, workingProvider],
          },
        ],
      }).compile();
      const multiProviderService =
        module.get<NotificationsService>(NotificationsService);

      await multiProviderService.notifyGmailReviewPending(5, 2);

      expect(brokenProvider.send).toHaveBeenCalled();
      expect(workingProvider.send).toHaveBeenCalled();
      expect(logRepository.create).toHaveBeenCalledTimes(1);
    });
  });
});
