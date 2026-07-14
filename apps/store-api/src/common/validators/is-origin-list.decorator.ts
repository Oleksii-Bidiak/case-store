import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * A browser compares the `Origin` header byte-for-byte against the allow-list, so
 * an entry must be EXACTLY scheme + host + optional port: no path, no trailing
 * slash, no query. `https://shop.example.com/` (one stray slash) never matches
 * `https://shop.example.com` and silently blocks every cross-origin request.
 */
const ORIGIN = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i;

export function parseOriginList(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

@ValidatorConstraint({ name: 'isOriginList', async: false })
class IsOriginListConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    const origins = parseOriginList(value);
    return origins.length > 0 && origins.every((origin) => ORIGIN.test(origin));
  }

  defaultMessage(): string {
    return (
      'CORS_ORIGINS is required in production and must be a comma-separated list ' +
      'of exact origins — scheme + host + optional port, with no trailing slash ' +
      'or path. e.g. "https://shop.example.com,https://admin.shop.example.com"'
    );
  }
}

/**
 * Validates a comma-separated CORS allow-list.
 *
 * Exists because a malformed value used to fail SILENTLY: `main.ts` falls back to
 * `http://localhost:3000` when CORS_ORIGINS is unset, and a typo'd entry simply
 * never matches. Either way the app boots looking perfectly healthy, and the
 * damage only shows up in a customer's browser console as an opaque CORS error —
 * about as far from the cause as a symptom can get. Far better to refuse to start.
 */
export function IsOriginList(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsOriginListConstraint,
    });
  };
}
