import { Test, TestingModule } from '@nestjs/testing';
import { ProcessedEmailsController } from './processed-emails.controller';
import { ProcessedEmailsService } from '../services/processed-emails.service';

describe('ProcessedEmailsController', () => {
  let controller: ProcessedEmailsController;
  let service: { createAnyway: jest.Mock };

  beforeEach(async () => {
    service = { createAnyway: jest.fn() };

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
});
