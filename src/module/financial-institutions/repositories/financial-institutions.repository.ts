import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';
import { UpdateFinancialInstitutionDto } from '../dto/update-financial-institution.dto';

export interface CreateFinancialInstitutionData {
  name: string;
  isActive?: boolean;
  parserKey?: string;
}

@Injectable()
export class FinancialInstitutionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, data: CreateFinancialInstitutionData) {
    return this.prisma.financialInstitution.create({
      data: { ...data, userId },
      include: { senders: true },
    });
  }

  findManyByUser(userId: number) {
    return this.prisma.financialInstitution.findMany({
      where: { userId },
      include: { senders: true },
      orderBy: { name: 'asc' },
    });
  }

  findOneOwned(id: number, userId: number) {
    return this.prisma.financialInstitution.findFirst({
      where: { id, userId },
      include: { senders: true },
    });
  }

  update(id: number, data: UpdateFinancialInstitutionDto) {
    return this.prisma.financialInstitution.update({
      where: { id },
      data,
      include: { senders: true },
    });
  }

  delete(id: number) {
    return this.prisma.financialInstitution.delete({
      where: { id },
    });
  }
}
