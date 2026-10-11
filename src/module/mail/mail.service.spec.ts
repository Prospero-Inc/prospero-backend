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
});
