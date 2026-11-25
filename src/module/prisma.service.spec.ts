import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  it('closes its connection pool when the app shuts down', async () => {
    const prisma = new PrismaService();
    const disconnect = jest
      .spyOn(prisma, '$disconnect')
      .mockResolvedValue(undefined);

    await prisma.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
