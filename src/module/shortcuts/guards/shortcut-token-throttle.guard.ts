import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'crypto';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { extractShortcutBearer } from '../utils/shortcut-token.util';
import {
  SHORTCUT_LOCALE,
  SHORTCUT_RATE_LIMIT,
  SHORTCUT_RATE_TTL_MS,
  SHORTCUT_THROTTLER_NAME,
} from '../shortcuts.constants';

/**
 * 30 requests/min per Shortcuts token, on the global throttler's storage.
 * Same approach as `LoginEmailThrottleGuard` (a plain guard over
 * `ThrottlerStorage`), not a `ThrottlerGuard` subclass with `@Throttle()`:
 * a subclass iterates the module's only throttler ("default"), so a
 * `@Throttle({ default })` on the route would also lower the global per-IP
 * limit there, and a `@SkipThrottle()` would switch both off.
 *
 * The global per-IP guard (60/min) still runs first and is deliberately
 * kept: it is looser than this one, so it never cuts a single token before
 * its 30, and it bounds floods of made-up tokens (each would get its own
 * per-token bucket). Runs before `ShortcutTokenGuard`, keyed by the hash of
 * the raw bearer, so a throttled token never reaches the DB lookup.
 */
@Injectable()
export class ShortcutTokenThrottleGuard implements CanActivate {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const raw = extractShortcutBearer(request.headers.authorization);
    // No token: ShortcutTokenGuard answers 401.
    if (!raw) return true;

    const key = createHash('sha256')
      .update(`${SHORTCUT_THROTTLER_NAME}:${raw}`)
      .digest('hex');
    const { isBlocked } = await this.storage.increment(
      key,
      SHORTCUT_RATE_TTL_MS,
      SHORTCUT_RATE_LIMIT,
      SHORTCUT_RATE_TTL_MS,
      SHORTCUT_THROTTLER_NAME,
    );

    if (isBlocked) {
      throw new ThrottlerException(
        this.i18n.t('shortcut.tooManyRequests', { lang: SHORTCUT_LOCALE }),
      );
    }
    return true;
  }
}
