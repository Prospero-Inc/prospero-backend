import { Module } from '@nestjs/common';
import { SalaryController } from './controllers/salary.controller';
import { SalaryService } from './services/salary.service';
import { PrismaService } from '../prisma.service';
import { SalaryRepository } from './repositories/salary.repository';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [SalaryController],
  providers: [SalaryService, PrismaService, SalaryRepository],
  exports: [SalaryService],
})
export class SalaryModule {}
