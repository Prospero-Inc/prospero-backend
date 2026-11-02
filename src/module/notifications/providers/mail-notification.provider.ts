import { Injectable } from '@nestjs/common';
import { NotificationChannel, User } from '@prisma/client';
import { MailService } from 'src/module/mail/mail.service';
import {
  NotificationPayload,
  NotificationProvider,
} from '../notifications.types';

/** The email's link: an explicit `ctaUrl`, or `ctaPath` joined to the
 * frontend's public URL with exactly one slash. Undefined (no button in
 * `notification.hbs`) when neither can be built. */
export const resolveCtaUrl = (
  payload: Pick<NotificationPayload, 'ctaUrl' | 'ctaPath'>,
  appBaseUrl: string | undefined = process.env.APP_BASE_URL,
): string | undefined => {
  if (payload.ctaUrl) return payload.ctaUrl;
  if (!appBaseUrl || !payload.ctaPath) return undefined;
  return `${appBaseUrl.replace(/\/+$/, '')}/${payload.ctaPath.replace(/^\/+/, '')}`;
};

/**
 * Translates a channel-agnostic `NotificationPayload` into an email via the
 * existing `MailModule` (same `@nestjs-modules/mailer` + `hbs` setup already
 * used for account activation / password reset — no new infra). Reuses one
 * generic template (`notification.hbs`) rather than one `.hbs` file per
 * `NotificationType`, since every notification today is "heading + body +
 * optional link", and spec §8's budget-threshold alerts will look the same.
 */
@Injectable()
export class MailNotificationProvider implements NotificationProvider {
  readonly channel = NotificationChannel.Email;

  constructor(private readonly mailService: MailService) {}

  async send(user: User, payload: NotificationPayload): Promise<void> {
    await this.mailService.sendNotificationEmail(user, {
      subject: payload.subject,
      body: payload.body,
      ctaUrl: resolveCtaUrl(payload),
      ctaLabel: payload.ctaLabel,
    });
  }
}
