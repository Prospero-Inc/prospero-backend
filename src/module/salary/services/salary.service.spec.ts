import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { SalaryRepository } from '../repositories/salary.repository';
import { CustomStrategy } from '../strategies/custom.strategy';

describe('SalaryService', () => {
  let service: SalaryService;
  let repository: {
    create: jest.Mock;
    findManyByUser: jest.Mock;
    findOneOwned: jest.Mock;
    update: jest.Mock;
    getUserSalaryDetails: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      findManyByUser: jest.fn(),
      findOneOwned: jest.fn(),
      update: jest.fn(),
      getUserSalaryDetails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryService,
        { provide: SalaryRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<SalaryService>(SalaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a salary entry scoped to the given user', async () => {
    repository.create.mockResolvedValue({ id: 1 });

    const result = await service.create(5, {
      amount: 2000,
      date: new Date('2026-09-13'),
    } as any);

    expect(repository.create).toHaveBeenCalledWith(5, {
      amount: 2000,
      date: new Date('2026-09-13'),
    });
    expect(result).toEqual({ message: 'Salario creado exitosamente' });
  });

  it('throws NotFoundException when updating a salary not owned by the user', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(
      service.update(1, 5, { amount: 100 } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('previews the distribution using the given strategy', () => {
    const strategy = new CustomStrategy(0.4, 0.3, 0.3);

    const result = service.distributeSalaryPreview(1000, strategy);

    expect(result.distribution).toEqual({
      necesidad: 400,
      deseo: 300,
      ahorro: 300,
    });
  });
});
