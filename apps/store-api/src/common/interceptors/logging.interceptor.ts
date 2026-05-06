import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

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
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - now;
          this.logger.info(`${method} ${url} ${statusCode} — ${duration}ms`);
        },
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
