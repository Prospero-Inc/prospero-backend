import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { withCents } from './money/money-columns';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // D3 double-write: every write that sets a Float amount also sets its
    // integer-cents twin, whatever repository it comes from.
    this.$use((params, next) =>
      next({
        ...params,
        args: withCents(params.model, params.action, params.args),
      }),
    );
  }

  async onModuleInit() {
    await this.$connect();
  }

  /** Runs on SIGTERM (enableShutdownHooks in main.ts), after in-flight
   * requests finish, so a deploy doesn't leave pooler connections open. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
