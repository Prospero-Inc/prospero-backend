import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FinancialInstitutionsService } from './financial-institutions.service';
import { FinancialInstitutionsRepository } from '../repositories/financial-institutions.repository';
import { InstitutionSendersRepository } from '../repositories/institution-senders.repository';

describe('FinancialInstitutionsService', () => {
  let service: FinancialInstitutionsService;
  let institutionsRepository: {
    create: jest.Mock;
    findManyByUser: jest.Mock;
    findOneOwned: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let sendersRepository: {
    create: jest.Mock;
    findOneOwned: jest.Mock;
    findByEmailForUser: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    institutionsRepository = {
      create: jest.fn(),
      findManyByUser: jest.fn(),
      findOneOwned: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    sendersRepository = {
      create: jest.fn(),
      findOneOwned: jest.fn(),
      findByEmailForUser: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialInstitutionsService,
        {
          provide: FinancialInstitutionsRepository,
          useValue: institutionsRepository,
        },
        { provide: InstitutionSendersRepository, useValue: sendersRepository },
      ],
    }).compile();

    service = module.get<FinancialInstitutionsService>(
      FinancialInstitutionsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('listSupportedParsers returns the bank parser registry entries', () => {
    expect(service.listSupportedParsers()).toEqual(
      expect.arrayContaining([
        { key: 'banco_agricola', label: 'Banco Agrícola' },
      ]),
    );
  });

  describe('create', () => {
    it('creates an institution scoped to the given user, with no senders', async () => {
      const dto = { name: 'Banco X' };
      institutionsRepository.create.mockResolvedValue({
        id: 1,
        userId: 5,
        name: 'Banco X',
        senders: [],
      });
      institutionsRepository.findOneOwned.mockResolvedValue({
        id: 1,
        userId: 5,
        name: 'Banco X',
        senders: [],
      });

      const result = await service.create(5, dto);

      expect(institutionsRepository.create).toHaveBeenCalledWith(5, {
        name: 'Banco X',
      });
      expect(sendersRepository.create).not.toHaveBeenCalled();
      expect(result.name).toBe('Banco X');
    });

    it('creates each sender passed alongside the institution', async () => {
      const dto = {
        name: 'Banco X',
        senders: ['a@bancox.com', 'b@bancox.com'],
      };
      sendersRepository.findByEmailForUser.mockResolvedValue(null);
      institutionsRepository.create.mockResolvedValue({ id: 1, userId: 5 });
      institutionsRepository.findOneOwned.mockResolvedValue({
        id: 1,
        userId: 5,
        senders: [],
      });

      await service.create(5, dto);

      expect(institutionsRepository.create).toHaveBeenCalledWith(5, {
        name: 'Banco X',
      });
      expect(sendersRepository.create).toHaveBeenCalledWith(1, 'a@bancox.com');
      expect(sendersRepository.create).toHaveBeenCalledWith(1, 'b@bancox.com');
    });

    it('throws ConflictException and creates nothing when a sender email is already used by another of the user institutions', async () => {
      const dto = { name: 'Banco X', senders: ['dup@bancox.com'] };
      sendersRepository.findByEmailForUser.mockResolvedValue({ id: 99 });

      await expect(service.create(5, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(institutionsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('update/remove', () => {
    it('throws NotFoundException when updating an institution not owned by the user', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue(null);

      await expect(
        service.update(1, 5, { name: 'New name' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(institutionsRepository.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when removing an institution not owned by the user', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue(null);

      await expect(service.remove(1, 5)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(institutionsRepository.delete).not.toHaveBeenCalled();
    });
  });

  describe('addSender', () => {
    it('throws NotFoundException when the institution is not owned by the user', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue(null);

      await expect(
        service.addSender(1, 5, { emailAddress: 'a@bancox.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(sendersRepository.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the email is already used by another institution of the same user', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue({
        id: 1,
        userId: 5,
      });
      sendersRepository.findByEmailForUser.mockResolvedValue({ id: 99 });

      await expect(
        service.addSender(1, 5, { emailAddress: 'dup@bancoy.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(sendersRepository.create).not.toHaveBeenCalled();
    });

    it('creates the sender when it is not a duplicate', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue({
        id: 1,
        userId: 5,
      });
      sendersRepository.findByEmailForUser.mockResolvedValue(null);
      sendersRepository.create.mockResolvedValue({
        id: 10,
        institutionId: 1,
        emailAddress: 'a@bancox.com',
      });

      const result = await service.addSender(1, 5, {
        emailAddress: 'a@bancox.com',
      });

      expect(sendersRepository.create).toHaveBeenCalledWith(1, 'a@bancox.com');
      expect(result.emailAddress).toBe('a@bancox.com');
    });
  });

  describe('removeSender', () => {
    it('throws NotFoundException when the institution is not owned by the user', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue(null);

      await expect(service.removeSender(1, 5, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(sendersRepository.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the sender does not belong to the institution', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue({
        id: 1,
        userId: 5,
      });
      sendersRepository.findOneOwned.mockResolvedValue(null);

      await expect(service.removeSender(1, 5, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(sendersRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes the sender when it belongs to the institution', async () => {
      institutionsRepository.findOneOwned.mockResolvedValue({
        id: 1,
        userId: 5,
      });
      sendersRepository.findOneOwned.mockResolvedValue({
        id: 10,
        institutionId: 1,
      });

      await service.removeSender(1, 5, 10);

      expect(sendersRepository.delete).toHaveBeenCalledWith(10);
    });
  });
});
