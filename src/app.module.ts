import { Module } from '@nestjs/common';

import { AuthModule } from './module/auth/auth.module';
import { UserModule } from './module/user/user.module';
import { SalaryModule } from './module/salary/salary.module';
import { MailModule } from './module/mail/mail.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AuthModule,
    UserModule,
    SalaryModule,
    MailModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
