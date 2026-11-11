import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { WalletCardsModule } from '../wallet-cards/wallet-cards.module';
import { MerchantRulesModule } from '../merchant-rules/merchant-rules.module';
import { ShortcutTokensController } from './controllers/shortcut-tokens.controller';
import { ShortcutTransactionsController } from './controllers/shortcut-transactions.controller';
import { ShortcutTokensRepository } from './repositories/shortcut-tokens.repository';
import { ShortcutTokensService } from './services/shortcut-tokens.service';
import { ShortcutTransactionsService } from './services/shortcut-transactions.service';
import { ShortcutTokenGuard } from './guards/shortcut-token.guard';
import { ShortcutTokenThrottleGuard } from './guards/shortcut-token-throttle.guard';

/**
 * iPhone Shortcuts "Transaction" automation: token management (JWT) and the
 * token-authenticated endpoint that records Apple Pay purchases. Sits on top
 * of transactions, wallet-cards and merchant-rules; nothing depends on it.
 * I18nService comes from the global I18nModule (NestI18nModule in AuthModule).
 */
@Module({
  imports: [TransactionsModule, WalletCardsModule, MerchantRulesModule],
  controllers: [ShortcutTokensController, ShortcutTransactionsController],
  providers: [
    PrismaService,
    ShortcutTokensRepository,
    ShortcutTokensService,
    ShortcutTransactionsService,
    ShortcutTokenGuard,
    ShortcutTokenThrottleGuard,
  ],
})
export class ShortcutsModule {}
