import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';
import { CreateFixedExpenseDto } from '../dto/create-fixed-expense.dto';
import { UpdateFixedExpenseDto } from '../dto/update-fixed-expense.dto';

@Injectable()
export class FixedExpensesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: number, data: CreateFixedExpenseDto) {
    return this.prisma.fixedExpense.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  findManyByUser(userId: number) {
    return this.prisma.fixedExpense.findMany({
      where: { userId },
      orderBy: { dueDate: 'asc' },
    });
  }

  findOneOwned(id: number, userId: number) {
    return this.prisma.fixedExpense.findFirst({
      where: { id, userId },
    });
  }

  update(id: number, data: UpdateFixedExpenseDto) {
    return this.prisma.fixedExpense.update({
      where: { id },
      data,
    });
  }

  delete(id: number) {
    return this.prisma.fixedExpense.delete({
      where: { id },
    });
  }
}
