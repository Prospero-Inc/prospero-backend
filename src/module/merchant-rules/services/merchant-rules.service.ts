import { Injectable } from '@nestjs/common';
import { BudgetCategory, MerchantRule } from '@prisma/client';
import { normalizeMerchantKey } from '../merchant-key.util';
import { MerchantRulesRepository } from '../repositories/merchant-rules.repository';

/**
 * "This merchant is always X", learned from the user's own classifications
 * (see `TransactionsService.update`) and read by the iPhone Shortcuts
 * endpoint to classify a purchase without asking. Every merchant string goes
 * through `normalizeMerchantKey`; an empty key is never stored nor matched.
 */
@Injectable()
export class MerchantRulesService {
  constructor(private readonly repository: MerchantRulesRepository) {}

  /** Returns `null` (and writes nothing) when the merchant normalizes to an
   * empty key. Last classification wins. */
  async upsert(
    userId: number,
    merchant: string,
    category: BudgetCategory,
  ): Promise<MerchantRule | null> {
    const key = normalizeMerchantKey(merchant);
    if (!key) return null;
    return this.repository.upsert(userId, key, category);
  }

  async find(userId: number, merchant: string): Promise<MerchantRule | null> {
    const key = normalizeMerchantKey(merchant);
    if (!key) return null;
    return this.repository.findByKey(userId, key);
  }
}
