import { NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ShortcutTokensService } from './shortcut-tokens.service';

describe('ShortcutTokensService', () => {
  const repository = {
    create: jest.fn(),
    findManyByUser: jest.fn(),
    findOneOwned: jest.fn(),
    findByTokenHash: jest.fn(),
    revoke: jest.fn(),
    touch: jest.fn(),
  };
  const service = new ShortcutTokensService(repository as never);

  beforeEach(() => jest.resetAllMocks());

  it('returns the raw prs_ token once and persists only its SHA-256', async () => {
    const createdAt = new Date();
    repository.create.mockImplementation(async (userId, name) => ({
      id: 1,
      userId,
      name,
      createdAt,
    }));

    const result = await service.create(7, ' iPhone ');

    expect(result.token).toMatch(/^prs_[A-Za-z0-9_-]{43}$/);
    const [, name, hash] = repository.create.mock.calls[0];
    expect(name).toBe('iPhone');
    expect(hash).toBe(createHash('sha256').update(result.token).digest('hex'));
    expect(hash).not.toContain(result.token);
    expect(result).toEqual({
      id: 1,
      name: 'iPhone',
      token: result.token,
      createdAt,
    });
  });

  it('lists tokens without hash or token', async () => {
    repository.findManyByUser.mockResolvedValue([
      {
        id: 1,
        userId: 7,
        name: 'iPhone',
        tokenHash: 'secret-hash',
        scope: 'shortcut:transactions',
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(0),
      },
    ]);

    const [item] = await service.findAllForUser(7);

    expect(item).not.toHaveProperty('tokenHash');
    expect(item).not.toHaveProperty('token');
    expect(Object.keys(item).sort()).toEqual(
      ['createdAt', 'id', 'lastUsedAt', 'name', 'revokedAt', 'scope'].sort(),
    );
  });

  it('revoke 404s for another user’s token', async () => {
    repository.findOneOwned.mockResolvedValue(null);

    await expect(service.revoke(1, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revoke is idempotent', async () => {
    const revokedAt = new Date(0);
    repository.findOneOwned.mockResolvedValue({ id: 1, revokedAt });

    const result = await service.revoke(1, 7);

    expect(repository.revoke).not.toHaveBeenCalled();
    expect(result.revokedAt).toBe(revokedAt);
  });
});
