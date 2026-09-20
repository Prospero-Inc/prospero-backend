import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';

export interface TransactionFilters {
  from?: Date;
  to?: Date;
}

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, data: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  findManyByUser(userId: number, filters: TransactionFilters = {}) {
    const { from, to } = filters;

    return this.prisma.transaction.findMany({
      where: {
        userId,
        ...((from || to) && {
          date: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
      },
      orderBy: { date: 'desc' },
    });
  }

  findOneOwned(id: number, userId: number) {
    return this.prisma.transaction.findFirst({
      where: { id, userId },
    });
  }

  update(id: number, data: UpdateTransactionDto) {
    return this.prisma.transaction.update({
      where: { id },
      data,
    });
  }

  delete(id: number) {
    return this.prisma.transaction.delete({
      where: { id },
    });
  }
}
