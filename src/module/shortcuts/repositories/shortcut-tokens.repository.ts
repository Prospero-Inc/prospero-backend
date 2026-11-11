import { Injectable } from '@nestjs/common';
import { ShortcutToken } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

@Injectable()
export class ShortcutTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: number,
    name: string,
    tokenHash: string,
  ): Promise<ShortcutToken> {
    return this.prisma.shortcutToken.create({
      data: { userId, name, tokenHash },
    });
  }

  findManyByUser(userId: number): Promise<ShortcutToken[]> {
    return this.prisma.shortcutToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOneOwned(id: number, userId: number): Promise<ShortcutToken | null> {
    return this.prisma.shortcutToken.findFirst({ where: { id, userId } });
  }

  findByTokenHash(tokenHash: string): Promise<ShortcutToken | null> {
    return this.prisma.shortcutToken.findUnique({ where: { tokenHash } });
  }

  revoke(id: number, revokedAt: Date): Promise<ShortcutToken> {
    return this.prisma.shortcutToken.update({
      where: { id },
      data: { revokedAt },
    });
  }

  async touch(id: number, lastUsedAt: Date): Promise<void> {
    await this.prisma.shortcutToken.update({
      where: { id },
      data: { lastUsedAt },
    });
  }
}
