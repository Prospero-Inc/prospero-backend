import { Test, TestingModule } from '@nestjs/testing';
import { ProcessedEmailsController } from './processed-emails.controller';
import { ProcessedEmailsService } from '../services/processed-emails.service';

describe('ProcessedEmailsController', () => {
  let controller: ProcessedEmailsController;
  let service: { createAnyway: jest.Mock; dismiss: jest.Mock };

  beforeEach(async () => {
    service = { createAnyway: jest.fn(), dismiss: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProcessedEmailsController],
      providers: [{ provide: ProcessedEmailsService, useValue: service }],
    }).compile();

    controller = module.get<ProcessedEmailsController>(
      ProcessedEmailsController,
    );
  });

  it('delegates create-anyway to the service, scoped to the authenticated user', async () => {
    const req = { user: { userId: 7 } };
    service.createAnyway.mockResolvedValue({ id: 999 });

    const result = await controller.createAnyway(req, 1);

    expect(service.createAnyway).toHaveBeenCalledWith(1, 7);
    expect(result).toEqual({ id: 999 });
  });

  it('delegates dismiss to the service, scoped to the authenticated user', async () => {
    const req = { user: { userId: 7 } };
    service.dismiss.mockResolvedValue(undefined);

    await controller.dismiss(req, 1);

    expect(service.dismiss).toHaveBeenCalledWith(1, 7);
  });
});
