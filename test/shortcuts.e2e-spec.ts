import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  BudgetCategory,
  MovementSource,
  PrismaClient,
  TransactionReviewStatus,
} from '@prisma/client';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService } from '../src/module/mail/mail.service';
import { TOKEN_TYPE } from '../src/module/auth/types';

/**
 * iPhone Shortcuts end to end: the full AppModule over HTTP against the same
 * throwaway Postgres as auth-flows (see that file for the local setup).
 * Users are created directly in the DB and get a signed access JWT; the
 * Shortcuts endpoint itself only ever sees `prs_` tokens.
 */

const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1', 'postgres'];

describe('iPhone Shortcuts (e2e, Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let jwt: JwtService;
  const userIds: number[] = [];

  let ipCounter = 0;
  let clientIp: string;

  const http = () => request(app.getHttpServer());
  const asUser = (accessToken: string) => ({
    get: (url: string) =>
      http()
        .get(url)
        .set('X-Forwarded-For', clientIp)
        .set('Authorization', `Bearer ${accessToken}`),
    post: (url: string) =>
      http()
        .post(url)
        .set('X-Forwarded-For', clientIp)
        .set('Authorization', `Bearer ${accessToken}`),
    patch: (url: string) =>
      http()
        .patch(url)
        .set('X-Forwarded-For', clientIp)
        .set('Authorization', `Bearer ${accessToken}`),
  });
  const shortcut = (token: string | null, body: Record<string, unknown>) => {
    const req = http()
      .post('/api/shortcuts/transactions')
      .set('X-Forwarded-For', clientIp);
    return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(
      body,
    );
  };

  /** A user plus an access JWT and a fresh Shortcuts token. */
  const createUser = async (label: string) => {
    const stamp = `${label}-${Date.now()}-${ipCounter}`;
    const user = await prisma.user.create({
      data: { email: `${stamp}@example.com`, username: stamp, isActive: true },
    });
    userIds.push(user.id);
    const accessToken = jwt.sign({
      email: user.email,
      userId: user.id,
      typ: TOKEN_TYPE.Access,
    });
    const { body } = await asUser(accessToken)
      .post('/api/shortcuts/tokens')
      .send({ name: 'iPhone' })
      .expect(201);
    return {
      userId: user.id,
      accessToken,
      token: body.token as string,
      tokenId: body.id as number,
    };
  };

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('shortcuts e2e needs DATABASE_URL');
    const { hostname } = new URL(url);
    if (!LOCAL_DB_HOSTS.includes(hostname)) {
      throw new Error(`shortcuts e2e refuses to run against "${hostname}"`);
    }
    if (!process.env.SECRET) throw new Error('shortcuts e2e needs SECRET');

    prisma = new PrismaClient();
    jwt = new JwtService({
      secret: process.env.SECRET,
      signOptions: { expiresIn: '15m' },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendVerificationUsers: jest.fn(),
        sendResetPassword: jest.fn(),
        sendNotificationEmail: jest.fn(),
      })
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    if (prisma && userIds.length > 0) {
      // Transaction.user has no cascade; the new tables do.
      await prisma.transaction.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(() => {
    ipCounter += 1;
    clientIp = `203.0.113.${ipCounter}`;
  });

  describe('tokens', () => {
    it('shows the raw token once, stores only its hash and lists without it', async () => {
      const { userId, accessToken, token, tokenId } = await createUser('tok');

      expect(token).toMatch(/^prs_[A-Za-z0-9_-]{43}$/);
      const stored = await prisma.shortcutToken.findUniqueOrThrow({
        where: { id: tokenId },
      });
      expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.tokenHash).not.toBe(token);
      expect(stored.userId).toBe(userId);

      const { body } = await asUser(accessToken)
        .get('/api/shortcuts/tokens')
        .expect(200);
      expect(body).toEqual([
        {
          id: tokenId,
          name: 'iPhone',
          scope: 'shortcut:transactions',
          lastUsedAt: null,
          createdAt: expect.any(String),
          revokedAt: null,
        },
      ]);
    });

    it('a revoked token gets 401', async () => {
      const { accessToken, token, tokenId } = await createUser('revoked');

      const { body } = await asUser(accessToken)
        .post(`/api/shortcuts/tokens/${tokenId}/revoke`)
        .expect(200);
      expect(body.revokedAt).toEqual(expect.any(String));

      const res = await shortcut(token, {
        amount: '1.00',
        merchant: 'Puma',
        card: 'BAC',
      }).expect(401);
      expect(res.body.message).toBe('Token de Atajos inválido o revocado');
    });

    it('cannot revoke another user’s token', async () => {
      const owner = await createUser('owner');
      const other = await createUser('other');

      await asUser(other.accessToken)
        .post(`/api/shortcuts/tokens/${owner.tokenId}/revoke`)
        .expect(404);
    });

    it('unknown token, no token and a normal JWT all get 401', async () => {
      const { accessToken, token } = await createUser('jwt');
      const body = { amount: '1.00', merchant: 'Puma', card: 'BAC' };

      await shortcut(`prs_${'x'.repeat(43)}`, body).expect(401);
      await shortcut(null, body).expect(401);
      await shortcut(accessToken, body).expect(401);
      // …and a Shortcuts token doesn't open the JWT-protected API either.
      await asUser(token).get('/api/transactions').expect(401);
    });
  });

  describe('POST /shortcuts/transactions', () => {
    it('sends an unclassified purchase to review, auto-registers the card and learns on confirm', async () => {
      const { userId, accessToken, token, tokenId } = await createUser('flow');

      await asUser(accessToken)
        .get('/api/shortcuts/status')
        .expect(200, { lastTransaction: null });

      const first = await shortcut(token, {
        amount: '$12.50',
        merchant: ' Puma ',
        card: 'BAC Visa',
        occurredAt: '2026-11-03T03:30:00Z',
      }).expect(200);
      expect(first.body).toEqual({
        status: 'pending_review',
        transactionId: expect.any(Number),
        message: 'Guardado: $12.50 en Puma · por revisar',
      });

      const card = await prisma.walletCard.findUniqueOrThrow({
        where: { userId_name: { userId, name: 'BAC Visa' } },
      });
      expect(card.defaultCategory).toBeNull();
      expect(card.configuredAt).toBeNull();
      const { body: cardList } = await asUser(accessToken)
        .get('/api/wallet-cards')
        .expect(200);
      expect(cardList).toEqual([
        expect.objectContaining({ id: card.id, name: 'BAC Visa', isNew: true }),
      ]);
      const token1 = await prisma.shortcutToken.findUniqueOrThrow({
        where: { id: tokenId },
      });
      expect(token1.lastUsedAt).not.toBeNull();

      // Same JSON the front reads for the review queue.
      const { body: queue } = await asUser(accessToken)
        .get('/api/transactions?reviewStatus=Detected,PendingReview')
        .expect(200);
      expect(queue).toEqual([
        expect.objectContaining({
          id: first.body.transactionId,
          amount: 12.5,
          amountCents: 1250,
          date: '2026-11-02T21:30:00.000Z',
          description: 'Puma',
          category: null,
          suggestedCategory: BudgetCategory.Necesidad,
          source: 'Shortcut',
          reviewStatus: 'PendingReview',
          walletCardId: card.id,
          walletCard: { id: card.id, name: 'BAC Visa' },
        }),
      ]);
      const { body: status } = await asUser(accessToken)
        .get('/api/shortcuts/status')
        .expect(200);
      expect(status).toEqual({
        lastTransaction: {
          id: first.body.transactionId,
          description: 'Puma',
          amount: 12.5,
          date: '2026-11-02T21:30:00.000Z',
          createdAt: expect.any(String),
        },
      });
      const summary = await asUser(accessToken)
        .get('/api/review-queue/summary')
        .expect(200);
      expect(summary.body.pendingTransactions).toBe(1);

      // Confirming in the queue (PATCH with category) learns "puma".
      const { body: patched } = await asUser(accessToken)
        .patch(`/api/transactions/${first.body.transactionId}`)
        .send({ category: 'Deseo' })
        .expect(200);
      expect(patched.walletCard).toEqual({ id: card.id, name: 'BAC Visa' });
      expect(patched).not.toHaveProperty('rememberMerchant');
      const rule = await prisma.merchantRule.findUniqueOrThrow({
        where: { userId_merchantKey: { userId, merchantKey: 'puma' } },
      });
      expect(rule.category).toBe(BudgetCategory.Deseo);

      // The merchant rule now classifies directly, over the card default.
      const { body: configured } = await asUser(accessToken)
        .patch(`/api/wallet-cards/${card.id}`)
        .send({ defaultCategory: 'Ahorro' })
        .expect(200);
      expect(configured).toMatchObject({
        defaultCategory: 'Ahorro',
        configuredAt: expect.any(String),
        isNew: false,
      });
      const second = await shortcut(token, {
        amount: 7.25,
        merchant: 'PUMA #4',
        card: 'BAC Visa',
      }).expect(200);
      expect(second.body.message).toBe('Guardado: $7.25 en PUMA #4 · Deseo');

      // Unknown merchant → card default.
      const third = await shortcut(token, {
        amount: '1.234,56',
        merchant: 'Pricesmart',
        card: 'BAC Visa',
      }).expect(200);
      expect(third.body.message).toBe(
        'Guardado: $1,234.56 en Pricesmart · Ahorro',
      );
      const created = await prisma.transaction.findUniqueOrThrow({
        where: { id: third.body.transactionId },
      });
      expect(created).toMatchObject({
        source: MovementSource.Shortcut,
        reviewStatus: TransactionReviewStatus.Confirmed,
        category: BudgetCategory.Ahorro,
        amountCents: 123456,
        walletCardId: card.id,
      });
      const { body: latest } = await asUser(accessToken)
        .get('/api/shortcuts/status')
        .expect(200);
      expect(latest.lastTransaction.id).toBe(third.body.transactionId);
    });

    it('rememberMerchant: false confirms without learning; true (default) learns', async () => {
      const { userId, accessToken, token } = await createUser('remember');

      const once = await shortcut(token, {
        amount: '14.50',
        merchant: 'La Neveria Escalón',
        card: 'BAC Visa Crédito',
      }).expect(200);
      await asUser(accessToken)
        .patch(`/api/transactions/${once.body.transactionId}`)
        .send({ category: 'Deseo', rememberMerchant: false })
        .expect(200);
      expect(await prisma.merchantRule.count({ where: { userId } })).toBe(0);
      await expect(
        prisma.transaction.findUniqueOrThrow({
          where: { id: once.body.transactionId },
        }),
      ).resolves.toMatchObject({
        category: BudgetCategory.Deseo,
        reviewStatus: TransactionReviewStatus.Confirmed,
      });

      await asUser(accessToken)
        .patch(`/api/transactions/${once.body.transactionId}`)
        .send({ category: 'Deseo', rememberMerchant: 'no' })
        .expect(400);
      await asUser(accessToken)
        .patch(`/api/transactions/${once.body.transactionId}`)
        .send({ category: 'Deseo', rememberMerchant: 'false' })
        .expect(400);
      expect(await prisma.merchantRule.count({ where: { userId } })).toBe(0);

      await asUser(accessToken)
        .patch(`/api/transactions/${once.body.transactionId}`)
        .send({ category: 'Deseo', rememberMerchant: true })
        .expect(200);
      expect(await prisma.merchantRule.count({ where: { userId } })).toBe(1);
    });

    it('answers a readable 400 for an invalid amount', async () => {
      const { token } = await createUser('bad');

      const res = await shortcut(token, {
        amount: 'gratis',
        merchant: 'Puma',
        card: 'BAC',
      }).expect(400);
      expect(res.body.message).toBe(
        'Monto inválido. Enviá un número mayor que 0, por ejemplo 12.50',
      );
      await shortcut(token, {
        amount: 0,
        merchant: 'Puma',
        card: 'BAC',
      }).expect(400);
    });

    it('a double fire is recorded once', async () => {
      const { userId, token } = await createUser('double');
      const body = { amount: '3.50', merchant: 'Starbucks', card: 'BAC' };

      await shortcut(token, body).expect(200);
      const again = await shortcut(token, body).expect(200);

      expect(again.body).toMatchObject({
        status: 'duplicate',
        message: 'Ya estaba registrado',
      });
      expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    });

    it('does not duplicate a manual expense of the same amount on the same day, and manual creation learns nothing', async () => {
      const { userId, accessToken, token } = await createUser('manual');

      await asUser(accessToken)
        .post('/api/transactions')
        .send({
          amount: 20,
          date: '2026-11-05T00:00:00.000Z',
          category: 'Necesidad',
          description: 'Super Selectos',
        })
        .expect(201);
      expect(await prisma.merchantRule.count({ where: { userId } })).toBe(0);

      const res = await shortcut(token, {
        amount: '20.00',
        merchant: 'Super Selectos',
        card: 'BAC',
        occurredAt: '2026-11-05T15:00:00-06:00',
      }).expect(200);

      expect(res.body.message).toBe('Ya estaba registrado');
      expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
    });

    it('Gmail first: confirms the pending Gmail row with the resolved category instead of creating', async () => {
      const { userId, accessToken, token } = await createUser('gmail');
      const institution = await prisma.financialInstitution.create({
        data: { userId, name: 'BAC', parserKey: 'bac_credomatic' },
      });
      const gmailRow = await prisma.transaction.create({
        data: {
          userId,
          amount: 9.99,
          date: new Date('2026-11-06T22:10:00.000Z'),
          description: 'ELECTRONICA STEREN',
          source: MovementSource.Gmail,
          reviewStatus: TransactionReviewStatus.PendingReview,
          institutionId: institution.id,
          gmailMessageId: `gm-${userId}`,
        },
      });
      await asUser(accessToken)
        .post('/api/wallet-cards')
        .send({ name: 'BAC Visa', defaultCategory: 'Necesidad' })
        .expect(201);

      const res = await shortcut(token, {
        amount: '9.99',
        merchant: 'Steren',
        card: 'BAC Visa',
        occurredAt: '2026-11-07T10:00:00-06:00',
      }).expect(200);

      expect(res.body).toEqual({
        status: 'duplicate',
        transactionId: gmailRow.id,
        message: 'Ya estaba registrado · Necesidad',
      });
      const confirmed = await prisma.transaction.findUniqueOrThrow({
        where: { id: gmailRow.id },
      });
      expect(confirmed).toMatchObject({
        category: BudgetCategory.Necesidad,
        reviewStatus: TransactionReviewStatus.Confirmed,
        // The Gmail row isn't re-attributed to the Shortcuts card.
        walletCardId: null,
      });
      expect(await prisma.transaction.count({ where: { userId } })).toBe(1);
      // BAC's description is the merchant: learned like a PATCH would.
      await expect(
        prisma.merchantRule.findUnique({
          where: {
            userId_merchantKey: { userId, merchantKey: 'electronica steren' },
          },
        }),
      ).resolves.toMatchObject({ category: BudgetCategory.Necesidad });
    });

    it('does not learn when confirming a Banco Agrícola Gmail row', async () => {
      const { userId, accessToken } = await createUser('agricola');
      const institution = await prisma.financialInstitution.create({
        data: { userId, name: 'Agrícola', parserKey: 'banco_agricola' },
      });
      const row = await prisma.transaction.create({
        data: {
          userId,
          amount: 1.5,
          date: new Date('2026-11-06T10:00:00.000Z'),
          description: 'Compañía: CLARO, PREPAGO (RECARGA); Paquete: Pack',
          source: MovementSource.Gmail,
          reviewStatus: TransactionReviewStatus.PendingReview,
          institutionId: institution.id,
          gmailMessageId: `ga-${userId}`,
        },
      });

      await asUser(accessToken)
        .patch(`/api/transactions/${row.id}`)
        .send({ category: 'Necesidad' })
        .expect(200);

      expect(await prisma.merchantRule.count({ where: { userId } })).toBe(0);
    });

    it('rate limits each token to 30 requests per minute', async () => {
      const a = await createUser('rate-a');
      const b = await createUser('rate-b');
      // Invalid amount: authenticated (counts) but creates nothing.
      const body = { amount: 'x', merchant: 'Puma', card: 'BAC' };

      for (let i = 0; i < 30; i += 1) {
        await shortcut(a.token, body).expect(400);
      }
      const blocked = await shortcut(a.token, body).expect(429);
      expect(blocked.body.message).toBe(
        'Demasiados movimientos seguidos. Esperá un minuto',
      );
      // Same IP, different token: its own bucket.
      await shortcut(b.token, body).expect(400);
    });
  });

  describe('wallet cards', () => {
    it('CRUD scoped to the user, 409 on a duplicated name', async () => {
      const { accessToken } = await createUser('cards');
      const other = await createUser('cards-other');

      const { body: card } = await asUser(accessToken)
        .post('/api/wallet-cards')
        .send({ name: 'Agrícola Débito' })
        .expect(201);
      expect(card).toMatchObject({
        name: 'Agrícola Débito',
        defaultCategory: null,
        financialInstitutionId: null,
        institutionName: null,
        configuredAt: expect.any(String),
        isNew: false,
      });
      await asUser(accessToken)
        .post('/api/wallet-cards')
        .send({ name: 'Agrícola Débito' })
        .expect(409);

      await asUser(other.accessToken)
        .patch(`/api/wallet-cards/${card.id}`)
        .send({ defaultCategory: 'Deseo' })
        .expect(404);

      const { body: list } = await asUser(accessToken)
        .get('/api/wallet-cards')
        .expect(200);
      expect(list).toHaveLength(1);

      await http()
        .delete(`/api/wallet-cards/${card.id}`)
        .set('X-Forwarded-For', clientIp)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
