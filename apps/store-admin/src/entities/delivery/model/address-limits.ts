/**
 * The length limits of `AddressDto` (`apps/store-api/src/order/dto/address.dto.ts`)
 * — the recipient and destination of every order the operator writes (the phone
 * order and the delivery edit). Each one is a `.max(n)` in the form schema AND a
 * `maxLength={n}` on its input (forms convention Rule 5d): a value the form lets
 * through must be one the DTO takes.
 */
export const ADDRESS_LIMITS = {
  /** `firstName` / `lastName` — `@MaxLength(100)` each. */
  name: 100,
  /** `phone` — `@MaxLength(30)` (then `@IsInternationalPhone`). */
  phone: 30,
  /** `city` — `@MaxLength(100)`. */
  city: 100,
  /** `address1` — `@MaxLength(500)`; also the NP branch on a directory pick. */
  address1: 500,
  /** `postalCode` — `@MaxLength(20)`. */
  postalCode: 20,
} as const;
