import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A 429 that knows how long the caller actually has to wait (TASK-762).
 *
 * `HttpExceptionFilter` rebuilds every error body into the one envelope
 * (`statusCode`, `error`, `message`, `timestamp`, `path`) and drops any other
 * key — deliberately, so an exception cannot leak internals by accident. This
 * class is the one exception to that rule, and it is a CLASS rather than a
 * magic body key for that reason: the filter passes `retryAfterSeconds` through
 * (and sets the `Retry-After` header) only for an instance of this type, never
 * for an arbitrary object that happens to carry the same property.
 *
 * Lives next to the filter because the filter is what gives it meaning.
 */
export class RetryAfterException extends HttpException {
  /** Whole seconds until a retry can succeed; always at least 1. */
  readonly retryAfterSeconds: number;

  constructor(params: { error: string; message: string; retryAfterSeconds: number }) {
    const retryAfterSeconds = Math.max(1, Math.ceil(params.retryAfterSeconds));
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: params.error,
        message: params.message,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
