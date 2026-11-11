import { Injectable } from '@nestjs/common';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';
import { LatestShortcutTransaction } from 'src/module/transactions/repositories/transactions.repository';

/** `GET /shortcuts/status` response. */
export interface ShortcutStatus {
  lastTransaction: LatestShortcutTransaction | null;
}

/** "Funcionando": the last purchase actually received confirms the whole
 * chain (token, shortcut, automation) works, without guessing. */
@Injectable()
export class ShortcutStatusService {
  constructor(private readonly transactionsService: TransactionsService) {}

  async getStatus(userId: number): Promise<ShortcutStatus> {
    return {
      lastTransaction:
        await this.transactionsService.findLatestShortcutTransaction(userId),
    };
  }
}
