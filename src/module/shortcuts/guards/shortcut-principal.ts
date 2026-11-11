import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** What `ShortcutTokenGuard` attaches to the request (`req.shortcut`). */
export interface ShortcutPrincipal {
  userId: number;
  tokenId: number;
}

export type ShortcutRequest = { shortcut?: ShortcutPrincipal };

export const CurrentShortcut = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ShortcutPrincipal | undefined =>
    context.switchToHttp().getRequest<ShortcutRequest>().shortcut,
);
