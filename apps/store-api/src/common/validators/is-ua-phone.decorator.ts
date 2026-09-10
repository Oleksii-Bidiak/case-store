import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Digits in a UA local number, after the `380` country code. */
export const UA_PHONE_LOCAL_LENGTH = 9;

/** A normalised UA number: country code + local part, digits only. */
export const UA_PHONE_PATTERN = /^380\d{9}$/;

export const UA_PHONE_MESSAGE = 'Phone must be a Ukrainian number: +380 followed by 9 digits';

/**
 * Reduce a raw phone string to comparable digits — `380` + the local part when
 * the input carries a recognisable Ukrainian shape, and the bare digits
 * otherwise (which then simply fails {@link UA_PHONE_PATTERN}).
 *
 * Mirrors `normalizeUAPhone` in `apps/store-client/src/shared/lib/phone.ts`, and
 * exists for the same reason: the value that arrives has been through a display
 * mask, so `+380 67 123 4567`, `0671234567` and `+38 (067) 123-45-67` are one
 * number written three ways. Validating the punctuation instead of the number is
 * what let `12345` through as a callback number.
 */
export function normalizeUaPhone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('380')) return digits;
  if (digits.startsWith('80')) return `3${digits}`;
  if (digits.startsWith('0')) return `38${digits}`;
  // A bare local number, typed without any prefix at all.
  if (digits.length === UA_PHONE_LOCAL_LENGTH) return `380${digits}`;
  return digits;
}

@ValidatorConstraint({ name: 'isUaPhone', async: false })
class IsUaPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && UA_PHONE_PATTERN.test(normalizeUaPhone(value));
  }

  defaultMessage(): string {
    return UA_PHONE_MESSAGE;
  }
}

/**
 * Validates a Ukrainian phone number, whatever separators it was typed with
 * (TASK-407).
 *
 * ⛔ Scope, deliberately narrow: the **storefront contact form** only. It is NOT
 * applied to `order/dto/guest-contact.dto.ts` or `order/dto/address.dto.ts` — the
 * written decision there is that an order may legitimately carry a roaming or
 * cross-border number, and the owner reconfirmed it on 2026-09-10. A contact
 * form is different: it exists so we can call the person back, and a number we
 * cannot dial is not a contact.
 */
export function IsUaPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsUaPhoneConstraint,
    });
  };
}
