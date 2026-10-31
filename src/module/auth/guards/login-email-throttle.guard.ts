import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'crypto';
import { Request } from 'express';
import { translate } from 'src/lib/i18n';
import { LOGIN_EMAIL_LIMIT, LOGIN_EMAIL_WINDOW_MS } from '../auth.constants';

const THROTTLER_NAME = 'login-email';

/**
 * Limits login attempts per target email, so spreading a password-guessing
 * run over many IPs doesn't get around the per-IP limit. Shares the global
 * throttler's storage; the email is hashed so it is never kept in memory.
 */
@Injectable()
export class LoginEmailThrottleGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { body } = context.switchToHttp().getRequest<Request>();
    const email: unknown = body?.email;
    // Missing/invalid email: let the validation pipe answer 400.
    if (typeof email !== 'string' || !email.trim()) return true;

    const key = createHash('sha256')
      .update(`${THROTTLER_NAME}:${email.trim().toLowerCase()}`)
      .digest('hex');
    const { isBlocked } = await this.storage.increment(
      key,
      LOGIN_EMAIL_WINDOW_MS,
      LOGIN_EMAIL_LIMIT,
      LOGIN_EMAIL_WINDOW_MS,
      THROTTLER_NAME,
    );

    if (isBlocked) {
      throw new ThrottlerException(`${translate('exception.tooManyRequests')}`);
    }
    return true;
  }
}
