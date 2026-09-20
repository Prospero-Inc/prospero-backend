import { Test, TestingModule } from '@nestjs/testing';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from '../services/transactions.service';

describe('TransactionsController', () => {
  let controller: TransactionsController;
  let service: { create: jest.Mock; findAllForUser: jest.Mock };

  beforeEach(async () => {
    service = { create: jest.fn(), findAllForUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionsController],
      providers: [{ provide: TransactionsService, useValue: service }],
    }).compile();

    controller = module.get<TransactionsController>(TransactionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a transaction using the authenticated user id, never the body', () => {
    const req = { user: { userId: 7 } };
    const dto = { amount: 10 } as any;

    controller.create(req, dto);

    expect(service.create).toHaveBeenCalledWith(7, dto);
  });

  it('lists transactions scoped to the authenticated user', () => {
    const req = { user: { userId: 7 } };

    controller.findAll(req, {});

    expect(service.findAllForUser).toHaveBeenCalledWith(7, {
      from: undefined,
      to: undefined,
    });
  });
});
