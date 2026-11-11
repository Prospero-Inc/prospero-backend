import { Injectable } from '@nestjs/common';
import { BudgetCategory, Prisma, WalletCard } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

export interface WalletCardData {
  name?: string;
  defaultCategory?: BudgetCategory | null;
  financialInstitutionId?: number | null;
  configuredAt?: Date | null;
}

export type WalletCardWithInstitution = WalletCard & {
  financialInstitution: { name: string } | null;
};

const WITH_INSTITUTION = {
  financialInstitution: { select: { name: true } },
} satisfies Prisma.WalletCardInclude;

@Injectable()
export class WalletCardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyByUser(userId: number): Promise<WalletCardWithInstitution[]> {
    return this.prisma.walletCard.findMany({
      where: { userId },
      include: WITH_INSTITUTION,
      orderBy: { name: 'asc' },
    });
  }

  findOneOwned(id: number, userId: number): Promise<WalletCard | null> {
    return this.prisma.walletCard.findFirst({ where: { id, userId } });
  }

  findByName(userId: number, name: string): Promise<WalletCard | null> {
    return this.prisma.walletCard.findUnique({
      where: { userId_name: { userId, name } },
    });
  }

  create(
    userId: number,
    data: WalletCardData & { name: string },
  ): Promise<WalletCardWithInstitution> {
    return this.prisma.walletCard.create({
      data: { ...data, userId },
      include: WITH_INSTITUTION,
    });
  }

  update(id: number, data: WalletCardData): Promise<WalletCardWithInstitution> {
    return this.prisma.walletCard.update({
      where: { id },
      data,
      include: WITH_INSTITUTION,
    });
  }

  delete(id: number): Promise<WalletCard> {
    return this.prisma.walletCard.delete({ where: { id } });
  }

  async institutionBelongsTo(
    institutionId: number,
    userId: number,
  ): Promise<boolean> {
    const count = await this.prisma.financialInstitution.count({
      where: { id: institutionId, userId },
    });
    return count > 0;
  }
}
