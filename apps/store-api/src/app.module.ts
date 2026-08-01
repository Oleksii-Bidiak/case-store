import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { resolve } from 'node:path';
import { ServerResponse } from 'node:http';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth';
import { PermissionModule } from './auth/permissions';
import { AuditModule } from './audit';
import { AuditInterceptor } from './audit/audit.interceptor';
import { UserModule } from './user';
import { ProductModule } from './product';
import { CatalogImportModule } from './catalog-import';
import { ProductGroupModule } from './product-group';
import { CategoryModule } from './category';
import { BrandModule } from './brand';
import { AddonServiceModule } from './addon-service';
import { DeviceModule } from './device';
import { AttributeDefinitionModule } from './attribute-definition';
import { PagesModule } from './pages';
import { BlogModule } from './blog';
import { BannersModule } from './banners';
import { CarouselsModule } from './carousels';
import { SiteContactModule } from './site-contact';
import { SeoSettingsModule } from './seo-settings';
import { FaqModule } from './faq';
import { SlugRedirectModule } from './slug-redirect';
import { ContactModule } from './contact';
import { CartModule } from './cart';
import { WishlistModule } from './wishlist';
import { OrderModule } from './order';
import { PaymentModule } from './payment';
import { DiscountModule } from './discount';
import { ReviewModule } from './review';
import { DeliveryModule } from './delivery';
import { SearchModule } from './search';
import { AnalyticsModule } from './analytics';
import { DashboardModule } from './dashboard';
import { MailModule } from './mail';
import { MailOutboxModule } from './mail-outbox';
import { PublishingModule } from './publishing';
import { RedisCacheModule } from './cache';
import { CsrfModule } from './csrf';
import { NewsletterModule } from './newsletter';
import { buildThrottlerOptions } from './throttler';
import { HttpExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';
import { validateEnv } from './config/env.validation';
import { buildPinoHttpOptions } from './config/pino.config';

@Module({
  imports: [
    // Sentry error tracking — wires the SDK (initialised in `instrument.ts`) into
    // NestJS. Inert when SENTRY_DSN is unset (Sentry.init ran with enabled:false).
    SentryModule.forRoot(),

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

    // Static serving of uploaded files — product images (TASK-073) and the store
    // logo (TASK-299). Served at `/uploads`, outside the global `api` prefix, so
    // no route clash.
    //
    // The headers are a containment layer for user-uploaded content served from
    // our own origin: `nosniff` stops a mislabelled file being re-interpreted as
    // HTML/JS, and the CSP + `sandbox` mean that even an SVG that somehow slipped
    // past sanitize-svg.ts cannot execute script, load anything remote, or act
    // with our origin's authority when opened directly.
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          rootPath: resolve(config.get<string>('UPLOAD_DEST', './uploads')),
          serveRoot: '/uploads',
          serveStaticOptions: {
            index: false,
            fallthrough: true,
            setHeaders: (res: ServerResponse) => {
              res.setHeader('X-Content-Type-Options', 'nosniff');
              res.setHeader(
                'Content-Security-Policy',
                "default-src 'none'; style-src 'unsafe-inline'; sandbox",
              );
            },
          },
        },
      ],
    }),

    // Database
    PrismaModule,

    // Authentication
    AuthModule,

    // RBAC — permission matrix + PermissionGuard (global, TASK-334). Imported
    // BEFORE every feature module: the guard those modules reference resolves
    // PermissionService from this module's global export.
    PermissionModule,

    // Admin action log (global — provides AuditService everywhere, TASK-318)
    AuditModule,

    // User management
    UserModule,

    // Product catalog
    ProductModule,
    CatalogImportModule,

    // Product groups (sibling positions + attribute axes, TASK-142)
    ProductGroupModule,

    // Category management
    CategoryModule,

    // Product brands / manufacturers (TASK-189)
    BrandModule,

    // Add-on services / protection plans (TASK-174)
    AddonServiceModule,

    // Device-compatibility taxonomy (device brands/models + compat, TASK-190)
    DeviceModule,

    // Structured-spec templates (TASK-191)
    AttributeDefinitionModule,

    // Admin-managed static / service pages (TASK-153)
    PagesModule,

    // Blog / content platform (TASK-170)
    BlogModule,
    // Admin-managed homepage banners (TASK-186)
    BannersModule,
    // Admin-managed recommendation carousels (TASK-139)
    CarouselsModule,

    // Admin-managed site contact settings (TASK-154)
    SiteContactModule,

    // Admin-managed global SEO settings singleton (TASK-239)
    SeoSettingsModule,

    // Admin-managed global FAQ list (public read + FAQPage JSON-LD, TASK-242)
    FaqModule,

    // Slug-redirect ledger for renamed content slugs (public lookup, TASK-285)
    SlugRedirectModule,

    // Customer contact / support messages (public form + admin inbox, TASK-177)
    ContactModule,

    // Shopping cart
    CartModule,

    // Wishlist / favorites (guest via cookie, merges on login — TASK-076)
    WishlistModule,

    // Orders
    OrderModule,

    // Online payments — LiqPay adapter, callback webhook, reconcile cron
    // (TASK-330). Provider-agnostic behind PAYMENT_PROVIDER.
    PaymentModule,

    // Discounts / promo codes (TASK-079)
    DiscountModule,

    // Product reviews (public submission/list + admin moderation)
    ReviewModule,

    // Nova Poshta delivery proxy (city/warehouse search + cost estimate)
    DeliveryModule,

    // Meilisearch full-text product search + autocomplete (TASK-075)
    SearchModule,

    // Admin dashboard metrics
    DashboardModule,

    // Storefront traffic from the self-hosted Umami, proxied so the analytics
    // credential never reaches the admin's browser bundle (TASK-380)
    AnalyticsModule,

    // Transactional email (global — provides MailService everywhere)
    MailModule,

    // Transactional mail outbox + retry worker (global — provides
    // MailOutboxService everywhere; cron dispatch via SchedulerRegistry).
    MailOutboxModule,

    // Shared publishing infrastructure (global — provides RevalidationNotifier
    // everywhere; cron publisher of scheduled content via SchedulerRegistry).
    PublishingModule,

    // Redis cache layer (global — provides CacheService everywhere)
    RedisCacheModule,

    // CSRF protection (provides CsrfService + GET /api/csrf-token)
    CsrfModule,

    // Newsletter subscriptions (public opt-in + admin list/export — TASK-188)
    NewsletterModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Register filter and interceptor as providers so they receive PinoLogger via DI
    HttpExceptionFilter,
    LoggingInterceptor,
    // Register ThrottlerGuard globally so @Throttle() decorators work on all endpoints
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Admin action log (TASK-318). Registered here rather than via
    // `app.useGlobalInterceptors` in main.ts so it is also active under
    // `Test.createTestingModule`, which never runs main.ts — an audit trail that
    // exists in production but not in the e2e suite is one no test can defend.
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
