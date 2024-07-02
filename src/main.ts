import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

const API_DEFAULT_PORT = process.env.PORT || 3000;
const API_DEFAULT_PREFIX = process.env.API_PREFIX || '/api/v1/';
const SWAGGER_TITLE = 'Prospero API';
const SWAGGER_DESCRIPTION = 'API for Prospero financial management system';
const SWAGGER_PREFIX = '/docs';

function createSwagger(app: INestApplication) {
  const options = new DocumentBuilder()
    .setTitle(SWAGGER_TITLE)
    .setDescription(SWAGGER_DESCRIPTION)
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup(SWAGGER_PREFIX, app, document);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix(API_DEFAULT_PREFIX);

  if (!process.env.SWAGGER_ENABLE || process.env.SWAGGER_ENABLE === '1') {
    createSwagger(app);
  }

  await app.listen(API_DEFAULT_PORT);
}
bootstrap().catch((err) => {
  console.error(err);
  const defaultExitCode = 1;
  process.exit(defaultExitCode);
});
