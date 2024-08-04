import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/module/prisma.service';

@Injectable()
export class TransactionsRepository {
  constructor(private readonly prisma: PrismaService) {}
}
