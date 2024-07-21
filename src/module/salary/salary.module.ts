import { Module } from '@nestjs/common';
import { SalaryController } from './controllers/salary.controller';
import { SalaryService } from './services/salary.service';
import { PrismaService } from '../prisma.service';
import { SalaryRepository } from './repositories/salary.repository';

@Module({
  controllers: [SalaryController],
  providers: [SalaryService, PrismaService, SalaryRepository],
})
export class SalaryModule {}
