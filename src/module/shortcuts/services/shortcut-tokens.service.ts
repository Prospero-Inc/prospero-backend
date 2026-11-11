import { Injectable, NotFoundException } from '@nestjs/common';
import { ShortcutToken } from '@prisma/client';
import { ShortcutTokensRepository } from '../repositories/shortcut-tokens.repository';
import {
  generateShortcutToken,
  hashShortcutToken,
} from '../utils/shortcut-token.util';

/** `GET /shortcuts/tokens` item: never the raw token nor its hash. */
export interface ShortcutTokenView {
  id: number;
  name: string;
  scope: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

/** `POST /shortcuts/tokens` response: the only time the raw token leaves
 * the server. */
export interface CreatedShortcutToken {
  id: number;
  name: string;
  token: string;
  createdAt: Date;
}

const toView = (token: ShortcutToken): ShortcutTokenView => ({
  id: token.id,
  name: token.name,
  scope: token.scope,
  lastUsedAt: token.lastUsedAt,
  createdAt: token.createdAt,
  revokedAt: token.revokedAt,
});

/**
 * Long-lived bearer tokens for the iPhone Shortcuts automation (it can't do
 * the JWT login/refresh dance). Same storage rule as refresh tokens: only
 * the SHA-256 is persisted. No expiry; the user revokes them.
 */
@Injectable()
export class ShortcutTokensService {
  constructor(private readonly repository: ShortcutTokensRepository) {}

  async create(userId: number, name: string): Promise<CreatedShortcutToken> {
    const token = generateShortcutToken();
    const created = await this.repository.create(
      userId,
      name.trim(),
      hashShortcutToken(token),
    );
    return {
      id: created.id,
      name: created.name,
      token,
      createdAt: created.createdAt,
    };
  }

  async findAllForUser(userId: number): Promise<ShortcutTokenView[]> {
    const tokens = await this.repository.findManyByUser(userId);
    return tokens.map(toView);
  }

  /** Idempotent: revoking an already revoked token keeps its original
   * `revokedAt`. 404 for someone else's token. */
  async revoke(id: number, userId: number): Promise<ShortcutTokenView> {
    const token = await this.repository.findOneOwned(id, userId);
    if (!token) {
      throw new NotFoundException('Shortcut token not found');
    }
    if (token.revokedAt) return toView(token);
    return toView(await this.repository.revoke(id, new Date()));
  }

  /** Lookup for `ShortcutTokenGuard`, by the hash of the raw bearer value. */
  findByRawToken(rawToken: string): Promise<ShortcutToken | null> {
    return this.repository.findByTokenHash(hashShortcutToken(rawToken));
  }

  touch(id: number, at: Date = new Date()): Promise<void> {
    return this.repository.touch(id, at);
  }
}
