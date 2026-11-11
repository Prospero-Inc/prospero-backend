import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ShortcutTokensService } from '../services/shortcut-tokens.service';
import { ShortcutTokenGuard } from './shortcut-token.guard';

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('ShortcutTokenGuard', () => {
  const tokens = { findByRawToken: jest.fn() };
  const i18n = { t: jest.fn().mockReturnValue('Token inválido') };
  const guard = new ShortcutTokenGuard(
    tokens as unknown as ShortcutTokensService,
    i18n as unknown as I18nService,
  );

  beforeEach(() => tokens.findByRawToken.mockReset());

  const activeToken = {
    id: 3,
    userId: 7,
    scope: 'shortcut:transactions',
    revokedAt: null,
  };

  it('attaches { userId, tokenId } for a valid token', async () => {
    tokens.findByRawToken.mockResolvedValue(activeToken);
    const request: Record<string, unknown> = {
      headers: { authorization: 'Bearer prs_abc' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(tokens.findByRawToken).toHaveBeenCalledWith('prs_abc');
    expect(request.shortcut).toEqual({ userId: 7, tokenId: 3 });
  });

  it.each([
    ['missing header', undefined, null],
    ['a JWT instead of a prs_ token', 'Bearer eyJhbGciOi.x.y', null],
    ['an unknown token', 'Bearer prs_unknown', null],
    [
      'a revoked token',
      'Bearer prs_abc',
      { ...activeToken, revokedAt: new Date() },
    ],
    ['a token without the scope', 'Bearer prs_abc', { ...activeToken, scope: 'other' }],
  ])('401 for %s', async (_label, authorization, found) => {
    tokens.findByRawToken.mockResolvedValue(found);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('never looks up a JWT', async () => {
    await expect(
      guard.canActivate(
        contextFor({ headers: { authorization: 'Bearer eyJ.a.b' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.findByRawToken).not.toHaveBeenCalled();
  });
});
