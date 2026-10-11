import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from '../services/notification-preferences.service';

describe('NotificationPreferencesController', () => {
  let controller: NotificationPreferencesController;
  let service: { getForUser: jest.Mock; updateForUser: jest.Mock };

  beforeEach(async () => {
    service = { getForUser: jest.fn(), updateForUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationPreferencesController],
      providers: [
        { provide: NotificationPreferencesService, useValue: service },
      ],
    }).compile();

    controller = module.get<NotificationPreferencesController>(
      NotificationPreferencesController,
    );
  });

  it('returns the preference scoped to the authenticated user', async () => {
    const req = { user: { userId: 7 } };
    service.getForUser.mockResolvedValue({
      gmailReviewEmailEnabled: true,
      budgetAlertEmailEnabled: true,
    });

    const result = await controller.getPreferences(req);

    expect(service.getForUser).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      gmailReviewEmailEnabled: true,
      budgetAlertEmailEnabled: true,
    });
  });

  it('updates the preference scoped to the authenticated user', async () => {
    const req = { user: { userId: 7 } };
    const dto = { gmailReviewEmailEnabled: false };
    service.updateForUser.mockResolvedValue({
      gmailReviewEmailEnabled: false,
      budgetAlertEmailEnabled: true,
    });

    const result = await controller.updatePreferences(req, dto);

    expect(service.updateForUser).toHaveBeenCalledWith(7, dto);
    expect(result).toEqual({
      gmailReviewEmailEnabled: false,
      budgetAlertEmailEnabled: true,
    });
  });
});
