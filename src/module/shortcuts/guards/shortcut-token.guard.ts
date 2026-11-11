import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { ShortcutTokensService } from '../services/shortcut-tokens.service';
import { extractShortcutBearer } from '../utils/shortcut-token.util';
import {
  SHORTCUT_LOCALE,
  SHORTCUT_TRANSACTIONS_SCOPE,
} from '../shortcuts.constants';
import { ShortcutRequest } from './shortcut-principal';

/**
 * Authenticates `Authorization: Bearer prs_...` (a ShortcutToken), NOT a
 * JWT: a normal access token is rejected here, and a Shortcuts token is
 * rejected by JwtAuthGuard everywhere else. 401 when the token is missing,
 * unknown, revoked or lacks the `shortcut:transactions` scope. Attaches
 * `{ userId, tokenId }` as `req.shortcut`.
 */
@Injectable()
export class ShortcutTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: ShortcutTokensService,
    private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & ShortcutRequest>();
    const raw = extractShortcutBearer(request.headers.authorization);
    const token = raw ? await this.tokens.findByRawToken(raw) : null;

    if (
      !token ||
      token.revokedAt ||
      !token.scope.split(/\s+/).includes(SHORTCUT_TRANSACTIONS_SCOPE)
    ) {
      throw new UnauthorizedException(
        this.i18n.t('shortcut.invalidToken', { lang: SHORTCUT_LOCALE }),
      );
    }

    request.shortcut = { userId: token.userId, tokenId: token.id };
    return true;
  }
}
