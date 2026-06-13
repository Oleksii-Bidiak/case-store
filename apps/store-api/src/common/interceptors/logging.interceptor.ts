import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Request-level success logging (method, url, statusCode, responseTime) is
 * handled by pino-http `autoLogging` (configured in config/pino.config.ts),
 * which is the single source of truth for the per-request log line and carries
 * the correlation `reqId`. This interceptor only adds richer ERROR context
 * (4xx/5xx with statusCode + duration) that the autoLogging line does not
 * surface — so it intentionally has no success-path log.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        error: (error) => {
          const duration = Date.now() - now;
          this.logger.error(
            { statusCode: error.status || 500, duration, method, url },
            `${method} ${url} ${error.status || 500} — ${duration}ms — ${error.message}`,
          );
        },
      }),
    );
  }
}
