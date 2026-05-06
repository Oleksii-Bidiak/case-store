import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
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

  // Parse cookies from incoming requests (needed for refresh token)
  app.use(cookieParser());

  // CORS configuration — never fall back to wildcard with credentials
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
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

  // Global exception filter — consistent error envelope (injected via DI for PinoLogger)
  const httpExceptionFilter = app.get(HttpExceptionFilter);
  app.useGlobalFilters(httpExceptionFilter);

  // Global logging interceptor — request duration & status (injected via DI for PinoLogger)
  const loggingInterceptor = app.get(LoggingInterceptor);
  app.useGlobalInterceptors(loggingInterceptor);

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
