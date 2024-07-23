import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  const config = new DocumentBuilder()
    .setTitle('Prospero API documentation')
    .setDescription('The Prospero API description')
    .setVersion('1.0')
    .addServer('http://localhost:3000/api/', 'Local environment')
    .addServer('http://31.220.97.169:3000/api/', 'Staging')
    .addServer('https://#/', 'Production')
    .addTag('Endpoint')
    .addBearerAuth()
    .setContact(
      'Soporte',
      'http://mi-prospero.com/soporte',
      'soporte@mi-prospero.com',
    )
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);
  app.setGlobalPrefix('/api');
  app.enableCors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
  });
  await app.listen(3001);
}
bootstrap();
