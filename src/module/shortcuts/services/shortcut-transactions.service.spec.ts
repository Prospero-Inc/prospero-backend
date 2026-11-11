import { BadRequestException } from '@nestjs/common';
import {
  BudgetCategory,
  MovementSource,
  Transaction,
  TransactionReviewStatus,
} from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { TransactionsService } from 'src/module/transactions/services/transactions.service';
import { WalletCardsService } from 'src/module/wallet-cards/services/wallet-cards.service';
import { MerchantRulesService } from 'src/module/merchant-rules/services/merchant-rules.service';
import { ShortcutTokensService } from './shortcut-tokens.service';
import { ShortcutTransactionsService } from './shortcut-transactions.service';

/** Minimal Spanish catalogue mirroring src/i18n/es/shortcut.json. */
const ES: Record<string, string> = {
  'shortcut.saved': 'Guardado: {amount} en {merchant} · {category}',
  'shortcut.pendingReview': 'por revisar',
  'shortcut.alreadyRegistered': 'Ya estaba registrado',
  'shortcut.alreadyRegisteredWithCategory': 'Ya estaba registrado · {category}',
  'shortcut.invalidAmount': 'Monto inválido',
  'shortcut.invalidDate': 'Fecha inválida',
  'shortcut.category.Necesidad': 'Necesidad',
  'shortcut.category.Deseo': 'Deseo',
  'shortcut.category.Ahorro': 'Ahorro',
};

const fakeI18n = {
  t: (key: string, options?: { args?: Record<string, string> }) =>
    Object.entries(options?.args ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, value),
      ES[key] ?? key,
    ),
};

const NOW = new Date('2026-11-11T03:30:00.000Z'); // 2026-11-10 21:30 in SV
const LOCAL_NOW = new Date('2026-11-10T21:30:00.000Z');
const principal = { userId: 7, tokenId: 3 };

function row(overrides: Partial<Transaction>): Transaction {
  return {
    id: 1,
    userId: 7,
    amount: 12.5,
    amountCents: 1250,
    date: LOCAL_NOW,
    category: null,
    suggestedCategory: null,
    description: 'Puma',
    periodOverride: null,
    fixedExpenseId: null,
    source: MovementSource.Manual,
    reviewStatus: TransactionReviewStatus.Confirmed,
    institutionId: null,
    gmailMessageId: null,
    walletCardId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('ShortcutTransactionsService', () => {
  let service: ShortcutTransactionsService;
  let transactions: {
    createFromShortcut: jest.Mock;
    findDuplicateCandidates: jest.Mock;
    findRecentClassifiedWithDescription: jest.Mock;
    countConfirmedByCategory: jest.Mock;
    update: jest.Mock;
  };
  let cards: { findOrCreateByName: jest.Mock };
  let rules: { find: jest.Mock; upsert: jest.Mock };
  let tokens: { touch: jest.Mock };

  /** Candidates per source for findDuplicateCandidates. */
  let candidates: Partial<Record<MovementSource, Transaction[]>>;

  const body = (overrides = {}) => ({
    amount: '$12.50',
    merchant: ' Puma ',
    card: 'BAC Visa',
    ...overrides,
  });

  beforeEach(() => {
    candidates = {};
    transactions = {
      createFromShortcut: jest.fn().mockResolvedValue({ id: 99 }),
      findDuplicateCandidates: jest.fn(
        async (_userId: number, filters: { sources: MovementSource[] }) =>
          candidates[filters.sources[0]] ?? [],
      ),
      findRecentClassifiedWithDescription: jest.fn().mockResolvedValue([]),
      countConfirmedByCategory: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    };
    cards = {
      findOrCreateByName: jest.fn().mockResolvedValue({
        id: 1,
        name: 'BAC Visa',
        defaultCategory: null,
        financialInstitutionId: null,
      }),
    };
    rules = { find: jest.fn().mockResolvedValue(null), upsert: jest.fn() };
    tokens = { touch: jest.fn().mockResolvedValue(undefined) };

    service = new ShortcutTransactionsService(
      transactions as unknown as TransactionsService,
      cards as unknown as WalletCardsService,
      rules as unknown as MerchantRulesService,
      tokens as unknown as ShortcutTokensService,
      fakeI18n as unknown as I18nService,
    );
  });

  describe('category priority', () => {
    it('merchant rule wins over the card default', async () => {
      rules.find.mockResolvedValue({ category: BudgetCategory.Deseo });
      cards.findOrCreateByName.mockResolvedValue({
        id: 1,
        defaultCategory: BudgetCategory.Ahorro,
        financialInstitutionId: 4,
      });

      const result = await service.record(principal, body(), NOW);

      expect(rules.find).toHaveBeenCalledWith(7, 'Puma');
      expect(transactions.createFromShortcut).toHaveBeenCalledWith(7, {
        amount: 12.5,
        date: LOCAL_NOW,
        description: 'Puma',
        institutionId: 4,
        walletCardId: 1,
        category: BudgetCategory.Deseo,
        reviewStatus: TransactionReviewStatus.Confirmed,
      });
      expect(result).toEqual({
        status: 'created',
        transactionId: 99,
        message: 'Guardado: $12.50 en Puma · Deseo',
      });
    });

    it('falls back to the card default when no merchant rule matches', async () => {
      cards.findOrCreateByName.mockResolvedValue({
        id: 1,
        defaultCategory: BudgetCategory.Necesidad,
        financialInstitutionId: null,
      });

      const result = await service.record(principal, body(), NOW);

      expect(transactions.createFromShortcut).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          category: BudgetCategory.Necesidad,
          reviewStatus: TransactionReviewStatus.Confirmed,
        }),
      );
      expect(result.message).toBe('Guardado: $12.50 en Puma · Necesidad');
    });

    it('sends it to review with a suggestion when nothing applies', async () => {
      transactions.findRecentClassifiedWithDescription.mockResolvedValue([
        { description: 'PUMA #12', category: BudgetCategory.Deseo },
        { description: 'Puma', category: BudgetCategory.Deseo },
        { description: 'puma', category: BudgetCategory.Necesidad },
        { description: 'Super Selectos', category: BudgetCategory.Ahorro },
      ]);

      const result = await service.record(principal, body(), NOW);

      expect(transactions.createFromShortcut).toHaveBeenCalledWith(7, {
        amount: 12.5,
        date: LOCAL_NOW,
        description: 'Puma',
        institutionId: null,
        walletCardId: 1,
        category: null,
        reviewStatus: TransactionReviewStatus.PendingReview,
        suggestedCategory: BudgetCategory.Deseo,
      });
      expect(result).toEqual({
        status: 'pending_review',
        transactionId: 99,
        message: 'Guardado: $12.50 en Puma · por revisar',
      });
    });

    it('auto-registers the card through findOrCreateByName', async () => {
      await service.record(principal, body({ card: 'Agrícola Débito' }), NOW);

      expect(cards.findOrCreateByName).toHaveBeenCalledWith(
        7,
        'Agrícola Débito',
      );
    });
  });

  describe('suggestCategory', () => {
    it('uses the user’s most used confirmed category when the merchant is new', async () => {
      transactions.countConfirmedByCategory.mockResolvedValue([
        { category: BudgetCategory.Necesidad, count: 2 },
        { category: BudgetCategory.Ahorro, count: 5 },
      ]);

      await expect(service.suggestCategory(7, 'Nuevo')).resolves.toBe(
        BudgetCategory.Ahorro,
      );
    });

    it('defaults to Necesidad with no history', async () => {
      await expect(service.suggestCategory(7, 'Nuevo')).resolves.toBe(
        BudgetCategory.Necesidad,
      );
    });
  });

  describe('duplicates', () => {
    it('double fire: same Shortcut purchase within 2 minutes creates nothing', async () => {
      candidates.Shortcut = [
        row({ id: 40, source: MovementSource.Shortcut, amount: 12.49 }),
      ];

      const result = await service.record(principal, body(), NOW);

      expect(transactions.findDuplicateCandidates).toHaveBeenCalledWith(7, {
        sources: [MovementSource.Shortcut],
        createdAfter: new Date(NOW.getTime() - 2 * 60 * 1000),
      });
      expect(transactions.createFromShortcut).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'duplicate',
        transactionId: 40,
        message: 'Ya estaba registrado',
      });
    });

    it('a recent Shortcut row for another merchant is not a double fire', async () => {
      candidates.Shortcut = [
        row({ source: MovementSource.Shortcut, description: 'Starbucks' }),
      ];

      const result = await service.record(principal, body(), NOW);

      expect(result.status).toBe('pending_review');
    });

    it('manual expense with the same amount on the same day creates nothing', async () => {
      candidates.Manual = [row({ id: 41, amount: 12.5 })];

      const result = await service.record(principal, body(), NOW);

      expect(transactions.findDuplicateCandidates).toHaveBeenCalledWith(7, {
        sources: [MovementSource.Manual],
        dateFrom: new Date('2026-11-10T00:00:00.000Z'),
        dateTo: new Date('2026-11-10T23:59:59.999Z'),
      });
      expect(transactions.createFromShortcut).not.toHaveBeenCalled();
      expect(result.message).toBe('Ya estaba registrado');
    });

    it('manual expense with a different amount is not a duplicate', async () => {
      candidates.Manual = [row({ amount: 12.52 })];

      const result = await service.record(principal, body(), NOW);

      expect(result.status).toBe('pending_review');
    });

    it('Gmail first, still in review: applies the resolved category and creates nothing', async () => {
      rules.find.mockResolvedValue({ category: BudgetCategory.Necesidad });
      candidates.Gmail = [
        row({
          id: 42,
          source: MovementSource.Gmail,
          date: new Date('2026-11-09T18:00:00.000Z'),
          reviewStatus: TransactionReviewStatus.PendingReview,
        }),
      ];

      const result = await service.record(principal, body(), NOW);

      expect(transactions.findDuplicateCandidates).toHaveBeenCalledWith(7, {
        sources: [MovementSource.Gmail],
        dateFrom: new Date('2026-11-09T00:00:00.000Z'),
        dateTo: new Date('2026-11-11T23:59:59.999Z'),
      });
      expect(transactions.update).toHaveBeenCalledWith(42, 7, {
        category: BudgetCategory.Necesidad,
      });
      expect(transactions.createFromShortcut).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'duplicate',
        transactionId: 42,
        message: 'Ya estaba registrado · Necesidad',
      });
    });

    it('Gmail first, no category resolved: leaves the Gmail row untouched', async () => {
      candidates.Gmail = [
        row({
          id: 43,
          source: MovementSource.Gmail,
          reviewStatus: TransactionReviewStatus.PendingReview,
        }),
      ];

      const result = await service.record(principal, body(), NOW);

      expect(transactions.update).not.toHaveBeenCalled();
      expect(transactions.createFromShortcut).not.toHaveBeenCalled();
      expect(result.message).toBe('Ya estaba registrado');
    });

    it('Gmail first, already confirmed: does not overwrite the user’s category', async () => {
      cards.findOrCreateByName.mockResolvedValue({
        id: 1,
        defaultCategory: BudgetCategory.Deseo,
        financialInstitutionId: null,
      });
      candidates.Gmail = [
        row({
          id: 44,
          source: MovementSource.Gmail,
          category: BudgetCategory.Ahorro,
          reviewStatus: TransactionReviewStatus.Confirmed,
        }),
      ];

      const result = await service.record(principal, body(), NOW);

      expect(transactions.update).not.toHaveBeenCalled();
      expect(result.message).toBe('Ya estaba registrado');
    });

    it('prefers a Gmail row still in review over a confirmed one', async () => {
      rules.find.mockResolvedValue({ category: BudgetCategory.Deseo });
      candidates.Gmail = [
        row({
          id: 45,
          source: MovementSource.Gmail,
          reviewStatus: TransactionReviewStatus.Confirmed,
        }),
        row({
          id: 46,
          source: MovementSource.Gmail,
          date: new Date('2026-11-11T08:00:00.000Z'),
          reviewStatus: TransactionReviewStatus.PendingReview,
        }),
      ];

      const result = await service.record(principal, body(), NOW);

      expect(transactions.update).toHaveBeenCalledWith(46, 7, {
        category: BudgetCategory.Deseo,
      });
      expect(result.transactionId).toBe(46);
    });
  });

  describe('input', () => {
    it('400 with a readable message for an unparseable or non-positive amount', async () => {
      for (const amount of ['abc', '0', -3]) {
        await expect(
          service.record(principal, body({ amount }), NOW),
        ).rejects.toThrow(new BadRequestException('Monto inválido'));
      }
      expect(transactions.createFromShortcut).not.toHaveBeenCalled();
    });

    it('400 for an unparseable occurredAt', async () => {
      await expect(
        service.record(principal, body({ occurredAt: '2026-13-45' }), NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses occurredAt converted to El Salvador wall clock', async () => {
      await service.record(
        principal,
        body({ occurredAt: '2026-11-01T02:00:00Z' }),
        NOW,
      );

      expect(transactions.createFromShortcut).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          date: new Date('2026-10-31T20:00:00.000Z'),
        }),
      );
    });

    it('updates the token lastUsedAt on every authenticated request', async () => {
      await service.record(principal, body(), NOW);
      await expect(
        service.record(principal, body({ amount: 'x' }), NOW),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tokens.touch).toHaveBeenCalledTimes(2);
      expect(tokens.touch).toHaveBeenCalledWith(3, NOW);
    });

    it('formats thousands in the message', async () => {
      cards.findOrCreateByName.mockResolvedValue({
        id: 1,
        defaultCategory: BudgetCategory.Ahorro,
        financialInstitutionId: null,
      });

      const result = await service.record(
        principal,
        body({ amount: '1.234,5' }),
        NOW,
      );

      expect(result.message).toBe('Guardado: $1,234.50 en Puma · Ahorro');
    });
  });
});
