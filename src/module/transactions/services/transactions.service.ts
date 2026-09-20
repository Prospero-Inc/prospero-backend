import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { UpdateTransactionDto } from '../dto/update-transaction.dto';
import {
  TransactionFilters,
  TransactionsRepository,
} from '../repositories/transactions.repository';

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactionsRepository: TransactionsRepository,
  ) {}

  create(userId: number, createTransactionDto: CreateTransactionDto) {
    return this.transactionsRepository.create(userId, createTransactionDto);
  }

  findAllForUser(userId: number, filters: TransactionFilters = {}) {
    return this.transactionsRepository.findManyByUser(userId, filters);
  }

  private async findOwnedOrThrow(id: number, userId: number) {
    const transaction = await this.transactionsRepository.findOneOwned(
      id,
      userId,
    );

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async update(
    id: number,
    userId: number,
    updateTransactionDto: UpdateTransactionDto,
  ) {
    await this.findOwnedOrThrow(id, userId);
    return this.transactionsRepository.update(id, updateTransactionDto);
  }

  async remove(id: number, userId: number) {
    await this.findOwnedOrThrow(id, userId);
    return this.transactionsRepository.delete(id);
  }
}
