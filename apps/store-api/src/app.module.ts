import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth';
import { UserModule } from './user';
import { ProductModule } from './product';
import { CategoryModule } from './category';
import { CartModule } from './cart';
import { HttpExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    // Environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      // Fail fast at startup if required secrets/config are missing or invalid
      validate: validateEnv,
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Structured logging with Pino
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                },
              }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
      },
    }),

    // Database
    PrismaModule,

    // Authentication
    AuthModule,

    // User management
    UserModule,

    // Product catalog
    ProductModule,

    // Category management
    CategoryModule,

    // Shopping cart
    CartModule,
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
