import { Injectable } from '@nestjs/common';
import { BudgetCategory, MerchantRule } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

@Injectable()
export class MerchantRulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKey(userId: number, merchantKey: string): Promise<MerchantRule | null> {
    return this.prisma.merchantRule.findUnique({
      where: { userId_merchantKey: { userId, merchantKey } },
    });
  }

  upsert(
    userId: number,
    merchantKey: string,
    category: BudgetCategory,
  ): Promise<MerchantRule> {
    return this.prisma.merchantRule.upsert({
      where: { userId_merchantKey: { userId, merchantKey } },
      create: { userId, merchantKey, category },
      update: { category },
    });
  }
}
