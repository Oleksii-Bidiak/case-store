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
 * ── Scope, and why it is narrow ───────────────────────────────────────────────
 * Applied to the buyer-facing storefront forms only: the contact form
 * (`contact/dto/create-contact-message.dto.ts`) here, and checkout + contact on
 * the client through `apps/store-client/src/shared/lib/phone.ts`. Both ends of
 * the wire therefore answer to the same rule for a number a SHOPPER types: the
 * storefront is a Ukrainian shop, and the number exists so somebody can dial it.
 *
 * It is deliberately NOT applied to `order/dto/guest-contact.dto.ts` or
 * `order/dto/address.dto.ts`. Those fields also carry orders an operator enters
 * by hand and orders from API clients, where a roaming or border-region number
 * is legitimate; that is the written decision on the `phone` field of
 * `guest-contact.dto.ts`, landed with TASK-338 (commit `0dbc3df`, 2026-07-28)
 * and restated by the owner on 2026-09-10. TASK-407 did not reopen it, so plan
 * 173's line about `create-order.dto` / `create-manual-order.dto` is knowingly
 * left undone rather than quietly skipped. What those two DTOs do carry since
 * TASK-407 is {@link IsInternationalPhone}, which counts digits instead of mask
 * characters — country-agnostic, but no longer satisfied by punctuation alone.
 *
 * The two are only consistent read together, so read them together: a shopper
 * cannot submit a non-UA number through the storefront (the form refuses it
 * before the request is made), while the order endpoints still accept one from
 * an operator. If that ever stops being what the shop wants, both halves move at
 * once — the client schema, this decorator's scope and the order DTOs.
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
