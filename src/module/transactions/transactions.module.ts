import { Module } from '@nestjs/common';
import { TransactionsController } from './controllers/transactions.controller';
import { TransactionsService } from './services/transactions.service';
import { TransactionsRepository } from './repositories/transactions.repository';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, PrismaService],
})
export class TransactionsModule {}
