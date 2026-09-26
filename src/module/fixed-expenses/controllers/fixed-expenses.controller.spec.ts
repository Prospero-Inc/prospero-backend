import { Test, TestingModule } from '@nestjs/testing';
import { FixedExpensesController } from './fixed-expenses.controller';
import { FixedExpensesService } from '../services/fixed-expenses.service';

describe('FixedExpensesController', () => {
  let controller: FixedExpensesController;
  let service: {
    create: jest.Mock;
    findAllForUser: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    pay: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(),
      findAllForUser: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      pay: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FixedExpensesController],
      providers: [{ provide: FixedExpensesService, useValue: service }],
    }).compile();

    controller = module.get<FixedExpensesController>(FixedExpensesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a fixed expense using the authenticated user id, never the body', () => {
    const req = { user: { userId: 7 } };
    const dto = { amount: 10 } as any;

    controller.create(req, dto);

    expect(service.create).toHaveBeenCalledWith(7, dto);
  });

  it('lists fixed expenses scoped to the authenticated user', () => {
    const req = { user: { userId: 7 } };

    controller.findAll(req);

    expect(service.findAllForUser).toHaveBeenCalledWith(7);
  });

  it('updates a fixed expense scoped to the authenticated user', () => {
    const req = { user: { userId: 7 } };
    const dto = { amount: 20 } as any;

    controller.update(req, 1, dto);

    expect(service.update).toHaveBeenCalledWith(1, 7, dto);
  });

  it('removes a fixed expense scoped to the authenticated user', () => {
    const req = { user: { userId: 7 } };

    controller.remove(req, 1);

    expect(service.remove).toHaveBeenCalledWith(1, 7);
  });

  it('pays a fixed expense scoped to the authenticated user', () => {
    const req = { user: { userId: 7 } };

    controller.pay(req, 1);

    expect(service.pay).toHaveBeenCalledWith(1, 7);
  });
});
