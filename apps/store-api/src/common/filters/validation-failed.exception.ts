import { BadRequestException } from '@nestjs/common';

/** One failed class-validator constraint, addressed by its dot path in the request body. */
export interface FieldError {
  /** Dot path into the body: `email`, `shippingAddress.phone`, `items.0.quantity`. */
  field: string;
  /** The class-validator constraint key: `isEmail`, `isUaPhone`, `whitelistValidation`… */
  constraint: string;
}

/**
 * The 400 the global ValidationPipe throws (TASK-1984, D3).
 *
 * The body is exactly the stock pipe's — `{ statusCode, message: string[], error }`
 * — so the joined `message` every client already shows is unchanged. What it
 * adds is {@link fieldErrors}, which `HttpExceptionFilter` passes through for an
 * instance of THIS class only, on the same terms as `RetryAfterException`: the
 * envelope drops unknown keys so an exception cannot leak internals by accident,
 * and a pass-through by class rather than by body shape keeps that guarantee.
 *
 * The clients read it through `applyServerFieldErrors` (`shared/lib/form-errors.ts`
 * in both apps) to put the error under its field — forms convention, Rule 6b.
 */
export class ValidationFailedException extends BadRequestException {
  readonly fieldErrors: readonly FieldError[];

  constructor(messages: string[], fieldErrors: FieldError[]) {
    super(messages);
    this.fieldErrors = fieldErrors;
  }
}
