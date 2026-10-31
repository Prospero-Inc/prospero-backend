import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as request from 'supertest';
import * as speakeasy from 'speakeasy';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService } from '../src/module/mail/mail.service';

/**
 * Auth flows end to end: the full AppModule over HTTP against a real
 * Postgres (migrated with `prisma migrate deploy`), only email delivery is
 * mocked. Runs in CI on every pull request; locally:
 *
 *   docker run -d --rm -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:15
 *   export DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres
 *   DIRECT_URL=$DATABASE_URL npx prisma migrate deploy
 *   SECRET=e2e-secret npm run test:e2e
 */

const LOCAL_DB_HOSTS = ['localhost', '127.0.0.1', 'postgres'];

const assertDisposableDatabase = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('auth-flows e2e needs DATABASE_URL');
  // This suite wipes the users table: never let it near a real database.
  const { hostname } = new URL(url);
  if (!LOCAL_DB_HOSTS.includes(hostname)) {
    throw new Error(
      `auth-flows e2e refuses to run against non-local DB host "${hostname}"`,
    );
  }
};

describe('Auth flows (e2e, Postgres)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const mail = {
    sendVerificationUsers: jest.fn().mockResolvedValue(undefined),
    sendResetPassword: jest.fn().mockResolvedValue(undefined),
    sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const PASSWORD = 'Sup3r-secret!';
  let ipCounter = 0;
  // Each test talks from its own client IP (trusted from loopback, like
  // Caddy in prod) so per-IP route limits don't leak between tests.
  let clientIp: string;

  const http = () => request(app.getHttpServer());
  const post = (url: string) =>
    http().post(url).set('X-Forwarded-For', clientIp);
  const get = (url: string) => http().get(url).set('X-Forwarded-For', clientIp);
  const patch = (url: string) =>
    http().patch(url).set('X-Forwarded-For', clientIp);

  const uniqueEmail = (label: string) =>
    `${label}-${Date.now()}-${ipCounter}@example.com`;

  const signup = (email: string, username = email.split('@')[0]) =>
    post('/api/auth/signup').send({
      firstName: 'Ana',
      lastName: 'Martínez',
      email,
      usernName: username,
      password: PASSWORD,
    });

  /** Signs up and activates through the emailed link, returns the email. */
  const createActiveUser = async (label: string): Promise<string> => {
    const email = uniqueEmail(label);
    await signup(email).expect(201);
    const [user] = mail.sendVerificationUsers.mock.calls.at(-1);
    await get(
      `/api/auth/activate-account?id=${user.id}&code=${user.activationToken}`,
    ).expect(200);
    return email;
  };

  const login = (email: string, password = PASSWORD) =>
    post('/api/auth/login').send({ email, password });

  beforeAll(async () => {
    assertDisposableDatabase();

    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  beforeEach(() => {
    ipCounter += 1;
    clientIp = `198.51.100.${ipCounter}`;
  });

  describe('signup and login', () => {
    it('activates the account through the emailed link and logs in', async () => {
      const email = await createActiveUser('signup');

      const { body } = await login(email).expect(201);

      expect(body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { email },
      });
      await get('/api/auth/profile')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
    });

    it('answers a registered email exactly like a new one', async () => {
      const email = await createActiveUser('taken');

      const fresh = await signup(uniqueEmail('fresh'), `fresh${ipCounter}`);
      const repeated = await signup(email, `other${ipCounter}`);

      expect(repeated.status).toBe(fresh.status);
      expect(repeated.body).toEqual(fresh.body);
    });

    it('rejects a weak password at signup', async () => {
      await post('/api/auth/signup')
        .send({
          firstName: 'Ana',
          lastName: 'Martínez',
          email: uniqueEmail('weak'),
          usernName: `weak${ipCounter}`,
          password: 'password',
        })
        .expect(400);
    });

    it('answers an unknown email exactly like a wrong password', async () => {
      const email = await createActiveUser('enum');

      const wrongPassword = await login(email, 'Wr0ng-password!');
      const unknownEmail = await login(uniqueEmail('nobody'), PASSWORD);

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });
  });

  describe('refresh tokens', () => {
    it('rotates on use and revokes the family when an old one is replayed', async () => {
      const email = await createActiveUser('refresh');
      const { body: first } = await login(email).expect(201);

      const { body: second } = await post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(201);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      await post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      await post('/api/auth/refresh')
        .send({ refreshToken: second.refreshToken })
        .expect(401);
    });
  });

  describe('two-factor authentication', () => {
    it('requires the TOTP step and never accepts the preAuthToken as a session', async () => {
      const email = await createActiveUser('twofa');
      const { body: session } = await login(email).expect(201);
      const auth = `Bearer ${session.accessToken}`;

      const { body: setup } = await get('/api/auth/enable-2fa')
        .set('Authorization', auth)
        .expect(200);
      const code = () =>
        speakeasy.totp({ secret: setup.secret, encoding: 'base32' });
      await post('/api/auth/validate-2fa')
        .set('Authorization', auth)
        .send({ token: code() })
        .expect(201, { verified: true });

      const { body: pending } = await login(email).expect(201);
      expect(pending).toMatchObject({ requires2FA: true });
      expect(pending.accessToken).toBeUndefined();

      await get('/api/auth/profile')
        .set('Authorization', `Bearer ${pending.preAuthToken}`)
        .expect(401);

      const { body: full } = await post('/api/auth/login/verify-2fa')
        .send({ preAuthToken: pending.preAuthToken, token: code() })
        .expect(201);
      await get('/api/auth/profile')
        .set('Authorization', `Bearer ${full.accessToken}`)
        .expect(200);
    });
  });

  describe('password reset', () => {
    it('resets once with the emailed link and revokes existing sessions', async () => {
      const email = await createActiveUser('reset');
      const { body: session } = await login(email).expect(201);

      await patch('/api/auth/request-reset-password')
        .send({ email })
        .expect(200);
      const [, token] = mail.sendResetPassword.mock.calls.at(-1);

      const stored = await prisma.user.findUnique({ where: { email } });
      expect(stored.resetPasswordToken).not.toBe(token);

      const newPassword = 'N3w-passw0rd!';
      await post(`/api/auth/reset-password/${token}`)
        .send({ password: newPassword, confirmPassword: newPassword })
        .expect(201);
      await post(`/api/auth/reset-password/${token}`)
        .send({ password: newPassword, confirmPassword: newPassword })
        .expect(422);

      await post('/api/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      await login(email, PASSWORD).expect(401);
      await login(email, newPassword).expect(201);
    });

    it('rejects an expired link', async () => {
      const email = await createActiveUser('expired');
      await patch('/api/auth/request-reset-password')
        .send({ email })
        .expect(200);
      const [, token] = mail.sendResetPassword.mock.calls.at(-1);
      await prisma.user.update({
        where: { email },
        data: { resetPasswordExpiresAt: new Date(Date.now() - 1000) },
      });

      await post(`/api/auth/reset-password/${token}`)
        .send({ password: 'N3w-passw0rd!', confirmPassword: 'N3w-passw0rd!' })
        .expect(422);
    });

    it('answers the same for an unknown email', async () => {
      const email = await createActiveUser('reset-known');

      const known = await patch('/api/auth/request-reset-password').send({
        email,
      });
      const unknown = await patch('/api/auth/request-reset-password').send({
        email: uniqueEmail('reset-unknown'),
      });

      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
    });
  });
});
