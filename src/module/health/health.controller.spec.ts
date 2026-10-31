import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma.service';

describe('HealthController', () => {
  const build = (queryRaw: jest.Mock) =>
    new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);

  it('reports ok when the database answers', async () => {
    await expect(
      build(jest.fn().mockResolvedValue([{ '?column?': 1 }])).check(),
    ).resolves.toEqual({ status: 'ok' });
  });

  it('answers 503 when the database is unreachable', async () => {
    await expect(
      build(jest.fn().mockRejectedValue(new Error('ECONNREFUSED'))).check(),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
