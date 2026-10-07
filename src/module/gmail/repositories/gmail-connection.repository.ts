import { Injectable } from '@nestjs/common';
import { GmailConnection, GmailConnectionStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/module/prisma.service';
import { GmailConnectionWriteData } from '../types';

/**
 * CRUD-only access to `prisma.gmailConnection`, no business logic — same role
 * as `refresh-token.repository.ts`. The service decides whether a given
 * callback result should `create` or `update` (and exactly which fields to
 * include), it never delegates that decision here.
 */
@Injectable()
export class GmailConnectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: number): Promise<GmailConnection | null> {
    return this.prisma.gmailConnection.findUnique({ where: { userId } });
  }

  create(
    userId: number,
    data: GmailConnectionWriteData,
  ): Promise<GmailConnection> {
    return this.prisma.gmailConnection.create({
      data: { ...data, userId } as Prisma.GmailConnectionUncheckedCreateInput,
    });
  }

  update(
    userId: number,
    data: Partial<GmailConnectionWriteData>,
  ): Promise<GmailConnection> {
    return this.prisma.gmailConnection.update({
      where: { userId },
      data,
    });
  }

  updateStatus(
    userId: number,
    status: GmailConnectionStatus,
  ): Promise<GmailConnection> {
    return this.prisma.gmailConnection.update({
      where: { userId },
      data: { status },
    });
  }

  delete(userId: number): Promise<GmailConnection> {
    return this.prisma.gmailConnection.delete({ where: { userId } });
  }
}
