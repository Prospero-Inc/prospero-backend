import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MerchantRulesRepository } from './repositories/merchant-rules.repository';
import { MerchantRulesService } from './services/merchant-rules.service';

/**
 * Learned merchant → category rules. No domain dependencies on purpose:
 * `transactions` writes to it (learning) and `shortcuts` reads from it, so it
 * must sit below both.
 */
@Module({
  providers: [MerchantRulesService, MerchantRulesRepository, PrismaService],
  exports: [MerchantRulesService],
})
export class MerchantRulesModule {}
