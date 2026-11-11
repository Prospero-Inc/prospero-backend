import { Module } from '@nestjs/common';
import { TransactionsController } from './controllers/transactions.controller';
import { TransactionsService } from './services/transactions.service';
import { TransactionsRepository } from './repositories/transactions.repository';
import { PrismaService } from '../prisma.service';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';

@Module({
  imports: [MerchantRulesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, PrismaService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
