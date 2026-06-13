import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { CsrfService } from './csrf';
import { buildHelmetOptions } from './config/security.config';
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

  // Security: Helmet sets secure HTTP headers.
  //
  // Input-sanitization note: the global ValidationPipe (below) whitelists and
  // type-checks DTO fields but does NOT strip HTML from free-text strings
  // (product name/description, category name). Stored-XSS risk is low because
  // both frontends render these values through React JSX, which escapes HTML by
  // default, and no `dangerouslySetInnerHTML` is used on user-supplied data.
  // DTOs cap free-text length via `@MaxLength` to bound payload size. If a future
  // feature renders descriptions as raw HTML (rich text), add a sanitizer then.
  const isProduction = nodeEnv === 'production';
  app.use(helmet(buildHelmetOptions(isProduction)));

  // Parse cookies from incoming requests (needed for refresh token + CSRF)
  app.use(cookieParser());

  // CSRF protection (signed double-submit cookie) on the cookie-authenticated,
  // state-changing routes. Mounted at the Express layer AFTER cookieParser so
  // `req.cookies` is populated. Bearer-authenticated routes are not listed —
  // a cross-site request cannot set the Authorization header. `app.use(path)`
  // matches the path and all sub-paths, so '/api/cart' covers /api/cart/items
  // and /api/cart/items/:id; safe methods (GET on those paths) pass through and
  // bootstrap the token cookie.
  const csrfService = app.get(CsrfService);
  app.use('/api/auth/refresh', csrfService.protect);
  app.use('/api/cart', csrfService.protect);

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

  // Swagger/OpenAPI documentation (development only)
  if (nodeEnv === 'development') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Mobile Accessories Store API')
      .setDescription('B2C e-commerce platform for mobile accessories')
      .setVersion('0.1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        'access-token',
      )
      .addCookieAuth(
        'refreshToken',
        {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
        },
        'refresh-token',
      )
      .addCookieAuth(
        'cartToken',
        {
          type: 'apiKey',
          in: 'cookie',
          name: 'cartToken',
        },
        'cart-token',
      )
      .addTag('Health', 'Health check endpoints')
      .addTag('Auth', 'Authentication and authorization')
      .addTag('Users', 'User profile and admin user management')
      .addTag('Products', 'Product catalog browsing and admin management')
      .addTag('Categories', 'Category browsing and admin management')
      .addTag('Cart', 'Shopping cart management')
      .addTag('Security', 'CSRF token issuance')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      customSiteTitle: 'Mobile Accessories Store API',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 Application running on http://localhost:${port}`);
  logger.log(`📦 Environment: ${nodeEnv}`);
  if (nodeEnv === 'development') {
    logger.log(`📖 Swagger UI: http://localhost:${port}/api/docs`);
  }
}
bootstrap();
