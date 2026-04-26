---
name: observability
description: Implement structured logging with Pino (backend) and error tracking with Sentry (frontend + backend) for production monitoring.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: scaffolding
---

## What I Do

I implement observability patterns for the e-commerce platform: Pino structured JSON logging on the backend and Sentry error tracking on both frontend and backend.

## When to Use Me

Use me when setting up logging, error tracking, or request monitoring in `apps/store-api/src/` or `apps/store-client/src/` / `apps/store-admin/src/`.

## Backend: Pino Logger

### Installation

```bash
npm install nestjs-pino pino pino-pretty
```

### Module Setup

```typescript
// src/common/logger/logger.module.ts
import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        level: process.env.LOG_LEVEL || 'info',
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            query: req.query,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
          censor: '[REDACTED]',
        },
      },
    }),
  ],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
```

### Usage in Services

```typescript
// src/order/order.service.ts
import { PinoLogger } from 'nestjs-pino';
import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(OrderService.name);
  }

  async createOrder(userId: string, items: CartItemEntity[]) {
    this.logger.info({ userId, itemCount: items.length }, 'Creating order');

    try {
      const order = await this.orderRepository.create(userId, items);
      this.logger.info({ orderId: order.id, userId, total: order.total }, 'Order created successfully');
      return order;
    } catch (error) {
      this.logger.error({ err: error, userId }, 'Failed to create order');
      throw error;
    }
  }
}
```

### Request Duration Middleware

```typescript
// src/common/middleware/request-logger.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: PinoLogger) {}

  use(req: Request, res: Response, next: () => void) {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      this.logger.info({
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      }, 'Request completed');
    });
    next();
  }
}
```

### Log Levels

| Level | Use Case |
|-------|----------|
| `fatal` | Application crash, unrecoverable error |
| `error` | Failed operations, caught exceptions |
| `warn` | Deprecated usage, rate limit hit, validation failures |
| `info` | Business events: order created, user registered, payment processed |
| `debug` | Detailed debugging, query results, cache hits/misses |
| `trace` | Very detailed: function entry/exit, variable values |

## Backend: Sentry Integration

### Installation

```bash
npm install @sentry/node @sentry/profiling-node
```

### Setup

```typescript
// src/common/sentry/sentry.module.ts
import { Module, Global } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

@Global()
@Module({})
export class SentryModule {
  static forRoot() {
    if (process.env.SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.APP_VERSION || '0.1.0',
        integrations: [nodeProfilingIntegration()],
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
        profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      });
    }
    return { module: SentryModule };
  }
}
```

### Sentry Exception Filter

```typescript
// src/common/filters/sentry.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= 500) {
      Sentry.withScope((scope) => {
        scope.setTag('path', request.url);
        scope.setTag('method', request.method);
        scope.setUser({ id: request.user?.id });
        Sentry.captureException(exception);
      });
    }

    const message = exception instanceof HttpException ? exception.getMessage() : 'Internal server error';

    response.status(status).json({
      error: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message: typeof message === 'string' ? message : message,
      statusCode: status,
    });
  }
}
```

### Register in main.ts

```typescript
// src/main.ts
import { SentryModule } from './common/sentry/sentry.module';
import { SentryFilter } from './common/filters/sentry.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new SentryFilter());

  // ... rest of setup
}
```

## Frontend: Sentry Integration

### Installation

```bash
npm install @sentry/nextjs
```

### Setup (Next.js)

```typescript
// apps/store-client/sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration(),
    Sentry.browserTracingIntegration(),
  ],
});
```

```typescript
// apps/store-client/sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

```typescript
// apps/store-client/sentry.edge.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### next.config.ts Integration

```typescript
// apps/store-client/next.config.ts
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // ... your Next.js config
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: true,
});
```

### Error Boundary

```typescript
// apps/store-client/src/shared/ui/error-boundary/error-boundary.tsx
'use client';

import * as Sentry from '@sentry/nextjs';
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <button onClick={() => this.setState({ hasError: false })} className="mt-4 text-primary hover:underline">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

## Environment Variables

```env
# apps/store-api/.env.example
SENTRY_DSN=https://xxx@sentry.io/xxx
LOG_LEVEL=info
APP_VERSION=0.1.0

# apps/store-client/.env.example
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_APP_VERSION=0.1.0
```

## Rules

- ALWAYS use Pino for backend logging — never `console.log` in production code.
- ALWAYS redact sensitive data (passwords, tokens, cookies) in log output.
- ALWAYS log business events at `info` level: order creation, user registration, payment.
- ALWAYS capture 5xx errors in Sentry — never capture 4xx client errors.
- ALWAYS set `tracesSampleRate` to a lower value (0.1-0.2) in production.
- ALWAYS include `release` version in Sentry config for tracking regressions.
- NEVER log full request bodies for auth endpoints (login, register).
- NEVER send PII (personally identifiable information) to Sentry without user consent.
- ALWAYS use structured logging with context objects: `logger.info({ orderId, userId }, 'Order created')`.
- ALWAYS wrap critical user-facing components in ErrorBoundary with Sentry capture.