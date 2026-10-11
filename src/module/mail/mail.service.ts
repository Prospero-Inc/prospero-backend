import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '@prisma/client';

export interface NotificationEmailContent {
  subject: string;
  body: string;
  ctaUrl?: string;
  ctaLabel?: string;
}

@Injectable()
export class MailService {
  #logger = new Logger(MailService.name);
  constructor(private readonly mailerService: MailerService) {}

  async sendVerificationUsers(user: User) {
    const { activationToken: token, id, username } = user;
    console.log('user', user);
    console.log('user', user);
    const configService = new ConfigService();
    const verificationLink = `${configService.get('API_BASE_URL')}auth/activate-account?id=${id}&code=${token}`;
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Verify your email address',
      template: './account-verification',
      context: {
        userName: username,
        verificationLink,
      },
    });
  }

  async sendResetPassword(user: User, token) {
    const configService = new ConfigService();
    const resetPasswordLink = `${configService.get('API_BASE_URL_RESET')}auth/reset-password/${token}`;
    await this.mailerService.sendMail({
      to: user.email,
      subject: 'Reset your password',
      template: './reset-password',
      context: {
        userName: user.username,
        resetPasswordLink,
      },
    });
  }

  /**
   * Generic transactional notification email — backs
   * `MailNotificationProvider` (see `src/module/notifications`). Deliberately
   * one shared template (`notification.hbs`) rather than one per
   * `NotificationType`, since every notification is "heading + body +
   * optional CTA link" today; add a dedicated template only if a future
   * notification type needs materially different layout.
   */
  async sendNotificationEmail(user: User, content: NotificationEmailContent) {
    await this.mailerService.sendMail({
      to: user.email,
      subject: content.subject,
      template: './notification',
      context: {
        userName: user.firstName || user.username,
        heading: content.subject,
        body: content.body,
        ctaUrl: content.ctaUrl,
        ctaLabel: content.ctaLabel,
      },
    });
  }
}
