import { ValidationPipe, ValidationPipeOptions } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { FieldError, ValidationFailedException } from '../filters/validation-failed.exception';

/**
 * The one definition of the global request-validation pipe (TASK-1984, D3).
 *
 * `main.ts` installs it, and the e2e specs build their apps with it too, so a
 * test asserts the 400 the deployed app actually sends — `fieldErrors` included.
 * Before this every e2e spec spelled the options out by hand.
 */
export const GLOBAL_VALIDATION_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
};

/**
 * Flattens a class-validator error tree into one entry per failed constraint,
 * addressed by dot path: `shippingAddress.phone`, `items.0.quantity`. A
 * forbidden property comes out as constraint `whitelistValidation`.
 */
export function toFieldErrors(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = Object.keys(error.constraints ?? {}).map((constraint) => ({ field, constraint }));
    return [...own, ...toFieldErrors(error.children ?? [], field)];
  });
}

/**
 * The stock pipe with one change: its exception carries `fieldErrors`. `message`
 * is produced by the stock `flattenValidationErrors`, so it stays byte-for-byte
 * what clients have always received.
 */
export class GlobalValidationPipe extends ValidationPipe {
  constructor(options: ValidationPipeOptions = GLOBAL_VALIDATION_OPTIONS) {
    super(options);
  }

  createExceptionFactory() {
    return (validationErrors: ValidationError[] = []) =>
      new ValidationFailedException(
        this.flattenValidationErrors(validationErrors),
        toFieldErrors(validationErrors),
      );
  }
}

export function createGlobalValidationPipe(): GlobalValidationPipe {
  return new GlobalValidationPipe();
}
