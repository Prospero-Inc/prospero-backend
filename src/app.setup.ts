import { INestApplication } from '@nestjs/common';
import { I18nValidationExceptionFilter, I18nValidationPipe } from 'nestjs-i18n';
import { TRUSTED_PROXIES } from './config/trust-proxy';
import { buildCorsOrigins } from './config/cors';

/**
 * HTTP-level setup shared by main.ts and the e2e suites, so tests exercise
 * the same validation, client-IP and CORS behavior as production.
 */
export const configureApp = (app: INestApplication): void => {
  // Real client IP for the throttler, see trust-proxy.ts.
  app.getHttpAdapter().getInstance().set('trust proxy', TRUSTED_PROXIES);

  app.useGlobalPipes(
    new I18nValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(
    new I18nValidationExceptionFilter({
      detailedErrors: false,
    }),
  );

  app.setGlobalPrefix('/api');

  const corsOrigins = buildCorsOrigins(process.env);
  app.enableCors({
    origin: corsOrigins.length ? corsOrigins : false,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
  });
};
