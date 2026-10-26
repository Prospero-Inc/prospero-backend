import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';

export interface VapidDetails {
  readonly subject: string;
  readonly publicKey: string;
  readonly privateKey: string;
}

/**
 * Resolves the VAPID identity (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
 * `VAPID_SUBJECT`) once at boot. These env vars are optional: when any is
 * missing or invalid, Web Push is simply disabled (one warning logged here,
 * never per notification) and everything else — including the email
 * channel — keeps working. Read straight from `process.env`, same pattern as
 * `GMAIL_*`/`SECRET` (see `config.provider.ts`).
 *
 * Generate a key pair with `npx web-push generate-vapid-keys`. Rotating the
 * keys invalidates every existing browser subscription (the browser bound
 * it to the old public key), so treat them as long-lived.
 */
@Injectable()
export class VapidConfigService {
  private readonly logger = new Logger(VapidConfigService.name);
  private readonly details: VapidDetails | null;

  constructor() {
    this.details = this.resolve();
  }

  get isEnabled(): boolean {
    return this.details !== null;
  }

  get publicKey(): string | null {
    return this.details?.publicKey ?? null;
  }

  getDetails(): VapidDetails | null {
    return this.details;
  }

  private resolve(): VapidDetails | null {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim();

    if (!publicKey || !privateKey || !subject) {
      this.logger.warn(
        'VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not set — Web Push notifications are disabled (email still works)',
      );
      return null;
    }

    try {
      // Validates subject (mailto:/https:) and key encoding/length; throws
      // on anything malformed. Also sets web-push's global default, which is
      // harmless since the provider passes vapidDetails explicitly anyway.
      webpush.setVapidDetails(subject, publicKey, privateKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Invalid VAPID configuration — Web Push notifications are disabled (email still works): ${message}`,
      );
      return null;
    }

    return { subject, publicKey, privateKey };
  }
}
