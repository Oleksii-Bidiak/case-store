import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Digits in a Nova Poshta waybill (ТТН). Fourteen, always — NP issues no other length. */
export const NP_WAYBILL_DIGITS = 14;

/**
 * The characters a human legitimately types AROUND the digits of a waybill.
 *
 * Mirrors `PHONE_SHAPE` in `is-international-phone.decorator.ts` and exists for
 * the same reason: {@link normalizeWaybill} must not normalise a value this
 * shape would refuse, or it would rescue `2045 0000 0000 01 (перевірити)` into
 * passing by deleting the operator's own note.
 */
export const NP_WAYBILL_SHAPE = /^[\d\s-]+$/;

export const NP_WAYBILL_MESSAGE = 'A Nova Poshta waybill (ТТН) is exactly 14 digits';

/** Everything that is not a digit is a separator; this is the waybill itself. */
export function waybillDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * `class-transformer` transform that stores one waybill in ONE shape (TASK-426).
 *
 * A ТТН is copy-pasted out of the courier's interface far more often than it is
 * typed, and it arrives as `2045 0000 0000 01` as readily as `20450000000001`.
 * Both are the same parcel, and both end up in the shipped-notice email and in
 * the admin order search, so they must not end up in the column as two strings —
 * the same defect `normalizePhone` was written for (TASK-466).
 *
 * An empty result becomes `null`: "cleared", not "the empty string".
 *
 * Only a value that is already "a waybill and nothing else" is normalised.
 * Anything else is trimmed and handed on unchanged, so {@link IsNovaPoshtaWaybill}
 * reports what the operator actually sent rather than a normalised lie —
 * class-transformer runs BEFORE class-validator under the global
 * `transform: true` pipe, so this ordering is the whole reason for the guard.
 */
export const normalizeWaybill = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  return NP_WAYBILL_SHAPE.test(trimmed) ? waybillDigits(trimmed) : trimmed;
};

@ValidatorConstraint({ name: 'isNovaPoshtaWaybill', async: false })
class IsNovaPoshtaWaybillConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    const trimmed = value.trim();
    if (!NP_WAYBILL_SHAPE.test(trimmed)) return false;

    return waybillDigits(trimmed).length === NP_WAYBILL_DIGITS;
  }

  defaultMessage(): string {
    return NP_WAYBILL_MESSAGE;
  }
}

/**
 * Validates a Nova Poshta waybill number (ТТН) — AD-ORD-18, TASK-426.
 *
 * ── Why a length rule at all ──────────────────────────────────────────────────
 * `trackingNumber` carried only `@MaxLength(64)`, so `123` and `перевірю пізніше`
 * were both acceptable waybills. That is not a harmless field: saving it on a
 * SHIPPED order EMAILS THE CUSTOMER their tracking notice, so a typo does not sit
 * quietly in the admin panel — it goes out with the shop's name on it and sends
 * the buyer to a Nova Poshta page that knows nothing about their parcel.
 *
 * ── Counting DIGITS, not characters ───────────────────────────────────────────
 * The same property the phone validators are built on: the value has been through
 * a human's clipboard, so `2045 0000 0000 01` and `20450000000001` are one
 * waybill written two ways, while `--------------` is fourteen characters and no
 * waybill at all. The rule therefore runs on the stripped digits, and
 * {@link normalizeWaybill} stores what was measured.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 * Applied to `order/dto/update-order-details.dto.ts` only — the one place an
 * operator types a ТТН. It is deliberately NOT a general "tracking number" rule:
 * if the shop ever adds a second courier, this decorator stays Nova-Poshta-shaped
 * and the DTO grows a per-carrier branch, rather than this rule quietly widening
 * to whatever the newcomer accepts.
 */
export function IsNovaPoshtaWaybill(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNovaPoshtaWaybillConstraint,
    });
  };
}
