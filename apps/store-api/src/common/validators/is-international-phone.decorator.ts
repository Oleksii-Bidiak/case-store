import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Shortest number we accept: a Ukrainian local number, typed without a prefix, is 9 digits. */
export const PHONE_MIN_DIGITS = 9;

/** Longest number that can exist: E.164 caps a full international number at 15 digits. */
export const PHONE_MAX_DIGITS = 15;

export const INTERNATIONAL_PHONE_MESSAGE =
  'A valid phone number is required: 9 to 15 digits, any country code';

/**
 * The characters a human legitimately types AROUND the digits — a leading `+`,
 * then digits and the usual separators. Anything else (letters, a second `+`,
 * an extension) is not a number a courier can dial as we store it.
 *
 * Exported since TASK-466 so `normalize-phone.transform.ts` can ask the same
 * question this constraint asks: the transform must not normalise a value this
 * shape would refuse, or it would rescue it into passing validation.
 */
export const PHONE_SHAPE = /^\+?[\d\s().-]+$/;

/** Everything that is not a digit is decoration; this is the number itself. */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

@ValidatorConstraint({ name: 'isInternationalPhone', async: false })
class IsInternationalPhoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    const trimmed = value.trim();
    if (!PHONE_SHAPE.test(trimmed)) return false;

    const digits = phoneDigits(trimmed).length;
    return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS;
  }

  defaultMessage(): string {
    return INTERNATIONAL_PHONE_MESSAGE;
  }
}

/**
 * Validates a phone number by COUNTING ITS DIGITS, without assuming a country
 * (TASK-407).
 *
 * ── Why this lives next to `IsUaPhone` instead of replacing it ────────────────
 * The order DTOs (`order/dto/guest-contact.dto.ts`, `order/dto/address.dto.ts`)
 * deliberately accept foreign numbers: roaming and border-region numbers belong
 * to real buyers, and an operator taking a phone order types whatever the
 * customer dictates. That is the owner's standing decision — TASK-338, restated
 * on 2026-09-10: strict Ukrainian validation belongs on the storefront forms and
 * the contact form, never on the order endpoints.
 *
 * What was wrong there was not the permissiveness but the rule itself.
 * `@Matches(/^\+?[\d\s()-]{9,}$/)` measured MASK CHARACTERS, so `(((((((((` —
 * nine brackets and not one digit — was an acceptable courier callback number;
 * and `address.dto.ts`, the field the storefront checkout actually posts, had no
 * format rule at all, so `33333` went straight through. This decorator turns
 * "nine of any characters" into "nine to fifteen digits" and changes nothing
 * else: `+48 123 456 789` and `+1 (212) 555-0123` still pass.
 *
 * Use `IsUaPhone` where the number must be Ukrainian (the storefront contact
 * form); use this where any country is legitimate but the value must still be a
 * number somebody can dial.
 */
export function IsInternationalPhone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsInternationalPhoneConstraint,
    });
  };
}
