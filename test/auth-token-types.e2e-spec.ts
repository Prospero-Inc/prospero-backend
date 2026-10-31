import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { HttpService } from '@nestjs/axios';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';

import { AuthController } from '../src/module/auth/auth.controller';
import { AuthService } from '../src/module/auth/auth.service';
import { JwtStrategy } from '../src/module/auth/jwt-strategy';
import { ACCESS_TOKEN_TTL } from '../src/module/auth/auth.constants';
import { RefreshTokenRepository } from '../src/module/auth/repositories/refresh-token.repository';
import { UserService } from '../src/module/user/user.service';
import { MailService } from '../src/module/mail/mail.service';
import { GmailOAuthService } from '../src/module/gmail/services/gmail-oauth.service';
import { GmailConnectionRepository } from '../src/module/gmail/repositories/gmail-connection.repository';

/**
 * Fase 0 of docs/plan-remediacion.md: every JWT is signed with the same SECRET,
 * so each consumer must only accept its own `typ`. Runs the real controller,
 * JwtStrategy and services over HTTP; only persistence is mocked.
 */
describe('Auth token types (e2e)', () => {
  let app: INestApplication;
  let gmailOAuthService: GmailOAuthService;

  const PASSWORD = 'Sup3r-secret!';
  const totpSecret = speakeasy.generateSecret().base32;
  const currentCode = () =>
    speakeasy.totp({ secret: totpSecret, encoding: 'base32' });

  let user: Record<string, unknown>;

  beforeAll(() => {
    process.env.SECRET = 'e2e-test-secret';
    process.env.GMAIL_OAUTH_CLIENT_ID = 'client-id';
    process.env.GMAIL_OAUTH_REDIRECT_URI = 'http://localhost/callback';
  });

  beforeEach(async () => {
    user = {
      id: 7,
      email: 'two-factor@example.com',
      password: await bcrypt.hash(PASSWORD, 4),
      isActive: true,
      enable2FA: true,
      twoFASecret: totpSecret,
      qr2FA: 'otpauth://totp/prospero',
      firstName: 'Ana',
      lastName: 'Martínez',
      username: 'ana',
    };

    const userService = {
      findOne: jest.fn(async () => user),
      findById: jest.fn(async () => user),
      findProfileById: jest.fn(async () => ({ id: user.id })),
      disable2FA: jest.fn(async () => {
        user.enable2FA = false;
        user.twoFASecret = null;
        return { message: '2FA disabled successfully' };
      }),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: process.env.SECRET,
          signOptions: { expiresIn: ACCESS_TOKEN_TTL },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        JwtStrategy,
        GmailOAuthService,
        { provide: UserService, useValue: userService },
        { provide: MailService, useValue: {} },
        { provide: RefreshTokenRepository, useValue: { create: jest.fn() } },
        { provide: GmailConnectionRepository, useValue: {} },
        { provide: HttpService, useValue: {} },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    gmailOAuthService = moduleRef.get(GmailOAuthService);
  });

  afterEach(async () => {
    await app.close();
  });

  const login = () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD });

  const loginWithTwoFactor = async (): Promise<string> => {
    const { body } = await login().expect(201);
    const res = await request(app.getHttpServer())
      .post('/auth/login/verify-2fa')
      .send({ preAuthToken: body.preAuthToken, token: currentCode() })
      .expect(201);
    return res.body.accessToken;
  };

  const getProfile = (token: string) =>
    request(app.getHttpServer())
      .get('/auth/profile')
      .set('Authorization', `Bearer ${token}`);

  it('rejects a 2FA preAuthToken used as a Bearer token', async () => {
    const { body } = await login().expect(201);
    expect(body.requires2FA).toBe(true);

    await getProfile(body.preAuthToken).expect(401);
  });

  it('rejects a Gmail OAuth state used as a Bearer token', async () => {
    const authorizeUrl = gmailOAuthService.buildAuthorizeUrl(user.id as number);
    const state = new URL(authorizeUrl).searchParams.get('state');

    await getProfile(state).expect(401);
  });

  it('accepts the access token issued after the 2FA step', async () => {
    const accessToken = await loginWithTwoFactor();

    await getProfile(accessToken).expect(200);
  });

  it('rejects an access token presented as a preAuthToken', async () => {
    const accessToken = await loginWithTwoFactor();

    await request(app.getHttpServer())
      .post('/auth/login/verify-2fa')
      .send({ preAuthToken: accessToken, token: currentCode() })
      .expect(401);
  });

  it('does not return the TOTP secret once 2FA is already enabled', async () => {
    const accessToken = await loginWithTwoFactor();

    const res = await request(app.getHttpServer())
      .get('/auth/enable-2fa')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain(totpSecret);
  });

  describe('disable-2fa', () => {
    it('is no longer reachable via GET', async () => {
      const accessToken = await loginWithTwoFactor();

      await request(app.getHttpServer())
        .get('/auth/disable-2fa')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      expect(user.enable2FA).toBe(true);
    });

    it('rejects a wrong TOTP code', async () => {
      const accessToken = await loginWithTwoFactor();

      await request(app.getHttpServer())
        .post('/auth/disable-2fa')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token: '000000' === currentCode() ? '111111' : '000000' })
        .expect(401);
      expect(user.enable2FA).toBe(true);
    });

    it('disables 2FA with a valid TOTP code', async () => {
      const accessToken = await loginWithTwoFactor();

      await request(app.getHttpServer())
        .post('/auth/disable-2fa')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token: currentCode() })
        .expect(200);
      expect(user.enable2FA).toBe(false);
    });
  });
});
