import { Injectable } from '@nestjs/common';
import { CreateTransactionDto } from '../dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  create(createTransactionDto: CreateTransactionDto) {
    return 'This action adds a new transaction';
  }
}
