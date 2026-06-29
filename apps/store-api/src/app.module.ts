import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { resolve } from 'node:path';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth';
import { UserModule } from './user';
import { ProductModule } from './product';
import { ProductGroupModule } from './product-group';
import { CategoryModule } from './category';
import { PagesModule } from './pages';
import { CartModule } from './cart';
import { OrderModule } from './order';
import { DeliveryModule } from './delivery';
import { DashboardModule } from './dashboard';
import { MailModule } from './mail';
import { RedisCacheModule } from './cache';
import { CsrfModule } from './csrf';
import { buildThrottlerOptions } from './throttler';
import { HttpExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';
import { validateEnv } from './config/env.validation';
import { buildPinoHttpOptions } from './config/pino.config';

@Module({
  imports: [
    // Environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      // Fail fast at startup if required secrets/config are missing or invalid
      validate: validateEnv,
    }),

    // Cron/interval scheduling — enables @Cron jobs (e.g. refresh-token cleanup).
    ScheduleModule.forRoot(),

    // Rate limiting — uses a shared Redis store when REDIS_HOST is set
    // (multi-instance correctness), otherwise an in-memory store.
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildThrottlerOptions,
    }),

    // Structured logging with Pino — config (level, redaction, request-id
    // correlation, serializers, health-probe silencing) is built from
    // ConfigService in buildPinoHttpOptions (config/pino.config.ts).
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildPinoHttpOptions,
    }),

    // Static serving of uploaded product images (local-disk storage, TASK-073).
    // Served at `/uploads` — outside the global `api` prefix, so no route clash.
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          rootPath: resolve(config.get<string>('UPLOAD_DEST', './uploads')),
          serveRoot: '/uploads',
          serveStaticOptions: { index: false, fallthrough: true },
        },
      ],
    }),

    // Database
    PrismaModule,

    // Authentication
    AuthModule,

    // User management
    UserModule,

    // Product catalog
    ProductModule,

    // Product groups (sibling positions + attribute axes, TASK-142)
    ProductGroupModule,

    // Category management
    CategoryModule,

    // Admin-managed static / service pages (TASK-153)
    PagesModule,

    // Shopping cart
    CartModule,

    // Orders
    OrderModule,

    // Nova Poshta delivery proxy (city/warehouse search + cost estimate)
    DeliveryModule,

    // Admin dashboard metrics
    DashboardModule,

    // Transactional email (global — provides MailService everywhere)
    MailModule,

    // Redis cache layer (global — provides CacheService everywhere)
    RedisCacheModule,

    // CSRF protection (provides CsrfService + GET /api/csrf-token)
    CsrfModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register filter and interceptor as providers so they receive PinoLogger via DI
    HttpExceptionFilter,
    LoggingInterceptor,
    // Register ThrottlerGuard globally so @Throttle() decorators work on all endpoints
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
