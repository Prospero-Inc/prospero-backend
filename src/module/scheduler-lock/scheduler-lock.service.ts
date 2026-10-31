import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import { PrismaService } from '../prisma.service';

/**
 * Makes a scheduled job run on one process at a time — e.g. while the old and
 * new containers overlap during a deploy. A lease (row in `scheduler_locks`
 * held until `locked_until`) rather than a Postgres advisory lock, because
 * production goes through a transaction-mode pooler where session-level
 * locks don't stick to a connection. The TTL must exceed the job's runtime;
 * if a process dies holding it, the lease simply expires.
 */
@Injectable()
export class SchedulerLockService {
  private readonly logger = new Logger(SchedulerLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Takes the lease if it's free or expired; returns the owner token or null. */
  async tryAcquire(name: string, ttlMs: number): Promise<string | null> {
    const owner = `${hostname()}:${process.pid}:${randomUUID()}`;
    const rows = await this.prisma.$queryRaw<{ name: string }[]>`
      INSERT INTO "scheduler_locks" ("name", "locked_until", "locked_by")
      VALUES (${name}, NOW() + (${ttlMs}::integer * INTERVAL '1 millisecond'), ${owner})
      ON CONFLICT ("name") DO UPDATE
        SET "locked_until" = EXCLUDED."locked_until",
            "locked_by" = EXCLUDED."locked_by"
        WHERE "scheduler_locks"."locked_until" < NOW()
      RETURNING "name"`;
    return rows.length ? owner : null;
  }

  /** Ends the lease early; a no-op if another owner has taken it since. */
  async release(name: string, owner: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "scheduler_locks" SET "locked_until" = NOW()
      WHERE "name" = ${name} AND "locked_by" = ${owner}`;
  }

  /** Runs `job` only if this process gets the lease; skips (and logs) otherwise. */
  async runExclusive(
    name: string,
    ttlMs: number,
    job: () => Promise<void>,
  ): Promise<boolean> {
    const owner = await this.tryAcquire(name, ttlMs);
    if (!owner) {
      this.logger.log(`Skipping "${name}": another process holds the lock`);
      return false;
    }
    try {
      await job();
      return true;
    } finally {
      await this.release(name, owner);
    }
  }
}
