import { PrismaService } from '../src/module/prisma.service';
import { MoneyIntegrityScheduler } from '../src/module/money/money-integrity.scheduler';
import { SchedulerLockService } from '../src/module/scheduler-lock/scheduler-lock.service';

/** D3 double-write against the real Postgres used by auth-flows. */
describe('Money in cents (Postgres)', () => {
  let prisma: PrismaService;
  let userId: number;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `cents-${Date.now()}@example.com`,
        username: `cents-${Date.now()}`,
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('writes amount_cents alongside amount on create and update', async () => {
    const created = await prisma.transaction.create({
      data: { userId, amount: 12.34, date: new Date(), category: 'Necesidad' },
    });
    expect(created.amountCents).toBe(1234);

    const updated = await prisma.transaction.update({
      where: { id: created.id },
      data: { amount: 0.1 + 0.2 },
    });
    expect(updated.amountCents).toBe(30);
  });

  it('backfills cents left NULL by the previous release and reports no mismatch', async () => {
    const [{ id }] = await prisma.$queryRaw<{ id: number }[]>`
      INSERT INTO "transactions" ("user_id", "amount", "date", "category", "updated_at")
      VALUES (${userId}, 1.005, NOW(), 'Deseo', NOW()) RETURNING "id"`;

    const scheduler = new MoneyIntegrityScheduler(
      prisma,
      {} as SchedulerLockService,
    );
    const report = await scheduler.check();

    const row = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(row.amountCents).toBe(101);
    expect(report.backfilled.transactions).toBeGreaterThanOrEqual(1);
    expect(report.mismatched.transactions).toBe(0);
  });
});
