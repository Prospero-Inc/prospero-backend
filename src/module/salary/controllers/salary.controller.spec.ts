import { Test, TestingModule } from '@nestjs/testing';
import { SalaryController } from './salary.controller';
import { SalaryService } from '../services/salary.service';
import { UserService } from '../../user/user.service';

describe('SalaryController', () => {
  let controller: SalaryController;
  let salaryService: { create: jest.Mock; distributeSalaryPreview: jest.Mock };
  let userService: { findById: jest.Mock };

  beforeEach(async () => {
    salaryService = {
      create: jest.fn(),
      distributeSalaryPreview: jest.fn(),
    };
    userService = { findById: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SalaryController],
      providers: [
        { provide: SalaryService, useValue: salaryService },
        { provide: UserService, useValue: userService },
      ],
    }).compile();

    controller = module.get<SalaryController>(SalaryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a salary using the authenticated user id, never the body', async () => {
    const req = { user: { userId: 7 } };
    const dto = { amount: 2000, date: new Date() } as any;

    await controller.createSalary(req, dto);

    expect(salaryService.create).toHaveBeenCalledWith(7, dto);
  });

  it('builds the preview strategy from the authenticated user settings', async () => {
    const req = { user: { userId: 7 } };
    userService.findById.mockResolvedValue({
      needsPercent: 0.4,
      wantsPercent: 0.3,
      savingsPercent: 0.3,
    });

    await controller.distributeSalaryPreview(req, { amount: 1000 } as any);

    expect(userService.findById).toHaveBeenCalledWith(7);
    expect(salaryService.distributeSalaryPreview).toHaveBeenCalledWith(
      1000,
      expect.objectContaining({ distributeSalary: expect.any(Function) }),
    );
  });
});
