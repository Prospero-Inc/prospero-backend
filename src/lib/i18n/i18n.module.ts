import { cwd } from 'process';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';

@Module({
  imports: [
    I18nModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => ({
        fallbackLanguage: 'en',
        fallbacks: {
          'es-*': 'es',
          'en-*': 'en',
          'es_*': 'es',
          'en_*': 'en',
          en: 'en',
          es: 'es',
        },
        logging: true,
        loaderOptions: {
          path: join(__dirname, '../../i18n/'),
          watch: true,
          includeSubfolders: true,
        },
        typesOutputPath: join(`${cwd()}/src/generated/i18n-generated.ts`),
      }),
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
  ],
  exports: [I18nModule],
})
export class NestI18nModule {}
