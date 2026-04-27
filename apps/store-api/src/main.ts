import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Use Pino logger as the default logger
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  // Security: Helmet sets secure HTTP headers
  app.use(helmet());

  // CORS configuration
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '*');
  app.enableCors({
    origin: corsOrigins === '*' ? '*' : corsOrigins.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global validation pipe — validate all incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter — consistent error envelope
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor — request duration & status
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Set global API prefix
  app.setGlobalPrefix('api', {
    exclude: ['health'],
  });

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 Application running on http://localhost:${port}`);
  logger.log(`📦 Environment: ${nodeEnv}`);
}

bootstrap();
