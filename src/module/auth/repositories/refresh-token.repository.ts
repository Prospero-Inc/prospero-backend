import { Injectable } from '@nestjs/common';
import { RefreshToken } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: number,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  revoke(
    tokenHash: string,
    replacedByTokenHash?: string,
  ): Promise<RefreshToken> {
    return this.prisma.refreshToken.update({
      where: { tokenHash },
      data: {
        revokedAt: new Date(),
        ...(replacedByTokenHash && { replacedByTokenHash }),
      },
    });
  }

  revokeAllForUser(userId: number): Promise<{ count: number }> {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Deletes tokens nobody can use anymore: already expired, or revoked
   * before `revokedBefore`. Recently revoked ones are kept so replaying them
   * still trips reuse detection (which revokes the whole family).
   */
  async deleteStale(now: Date, revokedBefore: Date): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: revokedBefore } }],
      },
    });
    return count;
  }
}
