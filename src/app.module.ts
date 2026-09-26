import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './module/auth/auth.module';
import { UserModule } from './module/user/user.module';
import { SalaryModule } from './module/salary/salary.module';
import { MailModule } from './module/mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { TransactionsModule } from './module/transactions/transactions.module';
import { PeriodsModule } from './module/periods/periods.module';
import { FixedExpensesModule } from './module/fixed-expenses/fixed-expenses.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    // Default rate limit for every endpoint (per client IP); auth's
    // sensitive routes (signup, login, password reset — each either
    // triggers a real SMTP send or is a brute-force target) override this
    // with tighter limits via @Throttle() in their own controller.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 60,
      },
    ]),
    AuthModule,
    UserModule,
    SalaryModule,
    MailModule,
    TransactionsModule,
    PeriodsModule,
    FixedExpensesModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
