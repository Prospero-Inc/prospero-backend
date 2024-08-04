import { Body, Controller, Post } from '@nestjs/common';
import { TransactionsService } from '../services/transactions.service';
import { CreateTransactionDto } from '../dto/create-transaction.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  create(@Body() createTransactionDto: CreateTransactionDto) {
    return this.transactionsService.create(createTransactionDto);
  }
}
