import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialInstitutionsRepository } from '../repositories/financial-institutions.repository';
import { InstitutionSendersRepository } from '../repositories/institution-senders.repository';
import { CreateFinancialInstitutionDto } from '../dto/create-financial-institution.dto';
import { UpdateFinancialInstitutionDto } from '../dto/update-financial-institution.dto';
import { CreateInstitutionSenderDto } from '../dto/create-institution-sender.dto';
import {
  SUPPORTED_PARSERS,
  SupportedParserInfo,
} from '../../gmail-sync/parsers/bank-parser.registry';

@Injectable()
export class FinancialInstitutionsService {
  constructor(
    private readonly financialInstitutionsRepository: FinancialInstitutionsRepository,
    private readonly institutionSendersRepository: InstitutionSendersRepository,
  ) {}

  private async findOwnedOrThrow(id: number, userId: number) {
    const institution = await this.financialInstitutionsRepository.findOneOwned(
      id,
      userId,
    );

    if (!institution) {
      throw new NotFoundException('Financial institution not found');
    }

    return institution;
  }

  private async assertSenderNotDuplicated(
    userId: number,
    emailAddress: string,
  ) {
    const existing = await this.institutionSendersRepository.findByEmailForUser(
      userId,
      emailAddress,
    );

    if (existing) {
      throw new ConflictException(
        `${emailAddress} is already configured as a sender for one of your institutions`,
      );
    }
  }

  /** Backs `GET /financial-institutions/supported-parsers`, the frontend's
   * bank-selection dropdown. */
  listSupportedParsers(): SupportedParserInfo[] {
    return SUPPORTED_PARSERS;
  }

  async create(userId: number, dto: CreateFinancialInstitutionDto) {
    const { senders = [], ...institutionData } = dto;

    for (const emailAddress of senders) {
      await this.assertSenderNotDuplicated(userId, emailAddress);
    }

    const institution = await this.financialInstitutionsRepository.create(
      userId,
      institutionData,
    );

    for (const emailAddress of senders) {
      await this.institutionSendersRepository.create(
        institution.id,
        emailAddress,
      );
    }

    return this.findOwnedOrThrow(institution.id, userId);
  }

  findAllForUser(userId: number) {
    return this.financialInstitutionsRepository.findManyByUser(userId);
  }

  async update(id: number, userId: number, dto: UpdateFinancialInstitutionDto) {
    await this.findOwnedOrThrow(id, userId);
    return this.financialInstitutionsRepository.update(id, dto);
  }

  async remove(id: number, userId: number) {
    await this.findOwnedOrThrow(id, userId);
    return this.financialInstitutionsRepository.delete(id);
  }

  async addSender(id: number, userId: number, dto: CreateInstitutionSenderDto) {
    await this.findOwnedOrThrow(id, userId);
    await this.assertSenderNotDuplicated(userId, dto.emailAddress);

    return this.institutionSendersRepository.create(id, dto.emailAddress);
  }

  async removeSender(id: number, userId: number, senderId: number) {
    await this.findOwnedOrThrow(id, userId);

    const sender = await this.institutionSendersRepository.findOneOwned(
      senderId,
      id,
    );

    if (!sender) {
      throw new NotFoundException('Institution sender not found');
    }

    return this.institutionSendersRepository.delete(senderId);
  }

  /** Used by GmailSyncOrchestrator to build the Gmail search query — only
   * senders of this user's active institutions. */
  findActiveSendersForUser(userId: number) {
    return this.institutionSendersRepository.findActiveSendersForUser(userId);
  }
}
