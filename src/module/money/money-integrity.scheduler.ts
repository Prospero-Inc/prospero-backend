import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';
import { SchedulerLockService } from '../scheduler-lock/scheduler-lock.service';

/** Same rounding as toCents(): half away from zero on the decimal value. */
const TABLES = [
  { table: 'transactions', amount: 'amount', cents: 'amount_cents' },
  { table: 'salaries', amount: 'amount', cents: 'amount_cents' },
  { table: 'fixed_expenses', amount: 'amount', cents: 'amount_cents' },
  {
    table: 'processed_emails',
    amount: 'parsed_amount',
    cents: 'parsed_amount_cents',
  },
] as const;

export interface MoneyIntegrityReport {
  backfilled: Record<string, number>;
  mismatched: Record<string, number>;
}

/**
 * D3 double-write safety net, daily until the Float columns are dropped:
 * fills cents the previous container left NULL during a deploy, and logs
 * rows where cents and the Float amount disagree — which must stay at zero
 * for a week before reads move to cents.
 */
@Injectable()
export class MoneyIntegrityScheduler {
  private readonly logger = new Logger(MoneyIntegrityScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulerLock: SchedulerLockService,
  ) {}

  @Cron('15 4 * * *')
  async handleDailyCheck(): Promise<void> {
    await this.schedulerLock.runExclusive(
      'money-integrity',
      10 * 60 * 1000,
      async () => {
        await this.check();
      },
    );
  }

  async check(): Promise<MoneyIntegrityReport> {
    const report: MoneyIntegrityReport = { backfilled: {}, mismatched: {} };

    // Table/column names come from the constant above, never from input.
    for (const { table, amount, cents } of TABLES) {
      report.backfilled[table] = await this.prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "${cents}" = ROUND("${amount}"::numeric * 100)::integer
         WHERE "${amount}" IS NOT NULL AND "${cents}" IS NULL`,
      );
      const [{ count }] = await this.prisma.$queryRawUnsafe<
        { count: bigint }[]
      >(
        `SELECT COUNT(*) AS count FROM "${table}"
         WHERE "${cents}" IS DISTINCT FROM ROUND("${amount}"::numeric * 100)::integer`,
      );
      report.mismatched[table] = Number(count);
    }

    const mismatches = Object.values(report.mismatched).reduce(
      (a, b) => a + b,
      0,
    );
    const log = `Money integrity: backfilled ${JSON.stringify(report.backfilled)}, mismatched ${JSON.stringify(report.mismatched)}`;
    if (mismatches > 0) this.logger.warn(log);
    else this.logger.log(log);

    return report;
  }
}
