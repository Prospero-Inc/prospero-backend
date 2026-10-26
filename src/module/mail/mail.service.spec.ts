import { Test, TestingModule } from '@nestjs/testing';
import { MailerService } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mailerService: { sendMail: jest.Mock };

  beforeEach(async () => {
    mailerService = { sendMail: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mailerService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sendNotificationEmail renders the shared notification template', async () => {
    const user = {
      email: 'user@example.com',
      username: 'user',
      firstName: 'Ana',
    } as any;

    await service.sendNotificationEmail(user, {
      subject: 'Tienes movimientos pendientes de revisión',
      body: 'Revísalos cuando puedas.',
      ctaUrl: 'https://app.prospero.com/transactions',
      ctaLabel: 'Revisar movimientos',
    });

    expect(mailerService.sendMail).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'Tienes movimientos pendientes de revisión',
      template: './notification',
      context: {
        userName: 'Ana',
        heading: 'Tienes movimientos pendientes de revisión',
        body: 'Revísalos cuando puedas.',
        ctaUrl: 'https://app.prospero.com/transactions',
        ctaLabel: 'Revisar movimientos',
      },
    });
  });

  describe('sendVerificationUsers', () => {
    const originalEnv = process.env;
    const user = {
      id: 7,
      email: 'user@example.com',
      username: 'user',
      activationToken: 'tok-123',
    } as any;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('links to the frontend verify-account page when APP_BASE_URL is set', async () => {
      process.env.APP_BASE_URL = 'https://app.example.com/';
      process.env.API_BASE_URL = 'https://api.example.com/';

      await service.sendVerificationUsers(user);

      const arg = mailerService.sendMail.mock.calls[0][0];
      expect(arg.to).toBe('user@example.com');
      expect(JSON.stringify(arg.context)).toContain(
        'https://app.example.com/auth/verify-account?id=7&code=tok-123',
      );
      expect(JSON.stringify(arg.context)).not.toContain('activate-account');
    });

    it('falls back to the API activate-account link without APP_BASE_URL', async () => {
      delete process.env.APP_BASE_URL;
      process.env.API_BASE_URL = 'https://api.example.com/';

      await service.sendVerificationUsers(user);

      const arg = mailerService.sendMail.mock.calls[0][0];
      expect(JSON.stringify(arg.context)).toContain(
        'https://api.example.com/auth/activate-account?id=7&code=tok-123',
      );
      expect(JSON.stringify(arg.context)).not.toContain('verify-account');
    });
  });
});
