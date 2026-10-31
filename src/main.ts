import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  // Configurar archivos estáticos
  app.useStaticAssets(join(__dirname, '..', 'public'));

  // Middleware para servir el index.html
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(join(__dirname, '..', 'public', 'index.html'));
    } else {
      next();
    }
  });
  // statics
  app.setBaseViewsDir(join(__dirname, 'module/auth/', 'views'));
  app.setViewEngine('hbs');

  // API docs only outside production: they map every endpoint for anyone.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Prospero API documentation UNAB!!!!!!!!!')
      .setDescription('The Prospero API description')
      .setVersion('1.0')
      .addServer('http://localhost:3000/api/', 'Local environment')
      .addServer('http://31.220.97.169:3000/api/', 'Staging')
      .addServer('https://#/', 'Production')
      .addTag('Endpoint')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .setContact(
        'Soporte',
        'http://mi-prospero.com/soporte',
        'soporte@mi-prospero.com',
      )
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .build();
    // The servers above already include /api/.
    const document = SwaggerModule.createDocument(app, config, {
      ignoreGlobalPrefix: true,
    });
    SwaggerModule.setup('api-docs', app, document);
  }

  await app.listen(3000);
}
bootstrap();
