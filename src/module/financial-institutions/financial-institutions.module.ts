import { Module } from '@nestjs/common';
import { FinancialInstitutionsController } from './controllers/financial-institutions.controller';
import { FinancialInstitutionsService } from './services/financial-institutions.service';
import { FinancialInstitutionsRepository } from './repositories/financial-institutions.repository';
import { InstitutionSendersRepository } from './repositories/institution-senders.repository';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [FinancialInstitutionsController],
  providers: [
    FinancialInstitutionsService,
    FinancialInstitutionsRepository,
    InstitutionSendersRepository,
    PrismaService,
  ],
  exports: [FinancialInstitutionsService],
})
export class FinancialInstitutionsModule {}
