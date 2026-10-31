import { PrismaService } from '../src/module/prisma.service';
import { SchedulerLockService } from '../src/module/scheduler-lock/scheduler-lock.service';

/** Against the real Postgres used by auth-flows (see that file for setup). */
describe('SchedulerLockService (Postgres)', () => {
  let prisma: PrismaService;
  let locks: SchedulerLockService;
  const name = () => `test-job-${Date.now()}-${Math.random()}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    locks = new SchedulerLockService(prisma);
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "scheduler_locks" WHERE "name" LIKE 'test-job-%'`;
    await prisma.$disconnect();
  });

  it('gives the lease to only one of two concurrent callers', async () => {
    const job = name();
    const results = await Promise.all([
      locks.tryAcquire(job, 60_000),
      locks.tryAcquire(job, 60_000),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('can be taken again after release', async () => {
    const job = name();
    const owner = await locks.tryAcquire(job, 60_000);
    expect(await locks.tryAcquire(job, 60_000)).toBeNull();

    await locks.release(job, owner as string);

    expect(await locks.tryAcquire(job, 60_000)).not.toBeNull();
  });

  it('can be taken once the lease expires, even without release', async () => {
    const job = name();
    await locks.tryAcquire(job, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await locks.tryAcquire(job, 60_000)).not.toBeNull();
  });

  it('runExclusive skips the job while another process holds it', async () => {
    const job = name();
    const run = jest.fn().mockResolvedValue(undefined);
    await locks.tryAcquire(job, 60_000);

    expect(await locks.runExclusive(job, 60_000, run)).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
