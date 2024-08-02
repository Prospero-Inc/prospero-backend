import { Module } from '@nestjs/common';

import { AuthModule } from './module/auth/auth.module';
import { UserModule } from './module/user/user.module';
import { SalaryModule } from './module/salary/salary.module';
import { MailModule } from './module/mail/mail.module';
import { ConfigModule } from '@nestjs/config';
import { TransactionsModule } from './module/transactions/transactions.module';
import {
  AcceptLanguageResolver,
  I18nModule,
  QueryResolver,
  HeaderResolver,
} from 'nestjs-i18n';
import { join } from 'path';

@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
    ConfigModule.forRoot(),
    AuthModule,
    UserModule,
    SalaryModule,
    MailModule,
    TransactionsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
console.log('Hello World!');
