import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';
import { translatePrismaError } from './prisma-error.translator';
import { RetryAfterException } from './retry-after.exception';
import { redactUrlSecrets } from '../security';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(HttpExceptionFilter.name);
  }

  catch(thrown: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // TASK-574: a Prisma failure that is really the client's (unique clash,
    // vanished row, bad input) becomes the 4xx it is. Done HERE, in the
    // catch-all, and not only in PrismaExceptionFilter: main.ts registers this
    // filter after every APP_FILTER, and Nest tries the last-registered first,
    // so this is the one that actually sees the error in production. The
    // original is logged for the operator; the client gets a stable code only.
    const translated = translatePrismaError(thrown);
    if (translated) {
      this.logger.warn(
        {
          event: 'prisma.errorTranslated',
          prismaCode: (thrown as { code?: string }).code,
          meta: (thrown as { meta?: unknown }).meta,
          status: translated.getStatus(),
          path: redactUrlSecrets(request.url),
        },
        'Prisma error answered as a client error',
      );
    }
    const exception: unknown = translated ?? thrown;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'InternalServerError';

    // Non-HTTP exceptions are unhandled (bugs) and are always reported to Sentry.
    let isUnhandled = false;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.constructor.name;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp.message as string) || exception.message;
        error = (resp.error as string) || exception.constructor.name;

        // Handle class-validator array of messages
        if (Array.isArray(resp.message)) {
          message = resp.message.join('; ');
        }
      }
    } else {
      // Unexpected errors — log them with structured data
      isUnhandled = true;
      this.logger.error(
        { err: exception, path: redactUrlSecrets(request.url) },
        exception instanceof Error ? exception.message : 'Unhandled exception',
      );
    }

    // Forward server-side failures to Sentry for alerting/aggregation: unhandled
    // (non-HTTP) exceptions and any explicit 5xx. 4xx client/validation errors are
    // deliberately NOT sent — they are expected and would be pure noise. Pino
    // remains the structured-log source of truth; this is the alerting sink only.
    // No-op when SENTRY_DSN is unset (Sentry.init ran with enabled:false).
    if (isUnhandled || status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception, {
        tags: { path: redactUrlSecrets(request.url), method: request.method },
      });
    }

    const responseBody: Record<string, unknown> = {
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // TASK-762: the one key allowed through the rebuilt envelope, and only from
    // the one class that owns it — see `RetryAfterException`. The header is the
    // standard channel (the throttler's own 429 sets it too); the body key is
    // for the storefront, which reads JSON more easily than a header through
    // CORS. main.ts exposes `Retry-After` for the same reason.
    if (exception instanceof RetryAfterException) {
      responseBody.retryAfterSeconds = exception.retryAfterSeconds;
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }

    response.status(status).json(responseBody);
  }
}
