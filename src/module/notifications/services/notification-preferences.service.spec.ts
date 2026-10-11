import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreferencesService } from './notification-preferences.service';
import { NotificationPreferenceRepository } from '../repositories/notification-preference.repository';

describe('NotificationPreferencesService', () => {
  let service: NotificationPreferencesService;
  let repository: { findOrDefault: jest.Mock; upsert: jest.Mock };

  beforeEach(async () => {
    repository = {
      findOrDefault: jest.fn(),
      upsert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: NotificationPreferenceRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<NotificationPreferencesService>(
      NotificationPreferencesService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns the effective preference for a user', async () => {
    repository.findOrDefault.mockResolvedValue({
      gmailReviewEmailEnabled: true,
      budgetAlertEmailEnabled: true,
    });

    const result = await service.getForUser(5);

    expect(repository.findOrDefault).toHaveBeenCalledWith(5);
    expect(result).toEqual({
      gmailReviewEmailEnabled: true,
      budgetAlertEmailEnabled: true,
    });
  });

  it('upserts only the fields provided in the update DTO', async () => {
    repository.upsert.mockResolvedValue({
      id: 1,
      userId: 5,
      gmailReviewEmailEnabled: false,
      budgetAlertEmailEnabled: true,
    });

    const result = await service.updateForUser(5, {
      gmailReviewEmailEnabled: false,
    });

    expect(repository.upsert).toHaveBeenCalledWith(5, {
      gmailReviewEmailEnabled: false,
    });
    expect(result.gmailReviewEmailEnabled).toBe(false);
  });
});
