import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { WalletCardsController } from './controllers/wallet-cards.controller';
import { WalletCardsRepository } from './repositories/wallet-cards.repository';
import { WalletCardsService } from './services/wallet-cards.service';

@Module({
  controllers: [WalletCardsController],
  providers: [WalletCardsService, WalletCardsRepository, PrismaService],
  exports: [WalletCardsService],
})
export class WalletCardsModule {}
