import { TransactionsService } from 'src/module/transactions/services/transactions.service';
import { ShortcutStatusService } from './shortcut-status.service';

describe('ShortcutStatusService', () => {
  const transactions = { findLatestShortcutTransaction: jest.fn() };
  const service = new ShortcutStatusService(
    transactions as unknown as TransactionsService,
  );

  it('returns the last Shortcut transaction', async () => {
    const last = {
      id: 4,
      description: 'Puma',
      amount: 25,
      date: new Date('2026-11-11T10:00:00.000Z'),
      createdAt: new Date('2026-11-11T16:00:00.000Z'),
    };
    transactions.findLatestShortcutTransaction.mockResolvedValue(last);

    await expect(service.getStatus(7)).resolves.toEqual({
      lastTransaction: last,
    });
    expect(transactions.findLatestShortcutTransaction).toHaveBeenCalledWith(7);
  });

  it('returns null when nothing has arrived yet', async () => {
    transactions.findLatestShortcutTransaction.mockResolvedValue(null);

    await expect(service.getStatus(7)).resolves.toEqual({
      lastTransaction: null,
    });
  });
});
