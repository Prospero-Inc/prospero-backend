import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';

@Injectable()
export class InstitutionSendersRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(institutionId: number, emailAddress: string) {
    return this.prisma.institutionSender.create({
      data: { institutionId, emailAddress },
    });
  }

  findOneOwned(id: number, institutionId: number) {
    return this.prisma.institutionSender.findFirst({
      where: { id, institutionId },
    });
  }

  // Scans every sender belonging to the user's own institutions, to enforce
  // "no duplicate sender email across any of the user's banks" (spec §6) —
  // the DB's unique constraint only covers duplicates within one institution.
  findByEmailForUser(userId: number, emailAddress: string) {
    return this.prisma.institutionSender.findFirst({
      where: { emailAddress, institution: { userId } },
    });
  }

  // Used by GmailSyncOrchestrator to build the Gmail search query: only
  // senders belonging to institutions the user has marked active — spec §11
  // ("no leer correos ajenos al propósito") means an inactive institution's
  // senders must never be queried.
  findActiveSendersForUser(userId: number) {
    return this.prisma.institutionSender.findMany({
      where: { institution: { userId, isActive: true } },
      include: { institution: true },
    });
  }

  delete(id: number) {
    return this.prisma.institutionSender.delete({
      where: { id },
    });
  }
}
