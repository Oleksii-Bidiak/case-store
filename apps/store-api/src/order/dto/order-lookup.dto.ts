import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { normalizePhone } from '../../common/validators';

/**
 * How many characters of the order id the customer is shown as "their number"
 * (TASK-483).
 *
 * Eight, because that is what `#94F5F971` on the confirmation email, the
 * storefront and the admin list already are — `id.slice(0, 8).toUpperCase()`.
 * Owner's decision B-5 §1: a "human" `#2026-000123` was considered and refused
 * as a migration that does not pay for itself, and the UUID prefix has one
 * security property a running counter does not — it cannot be walked in order.
 */
export const ORDER_NUMBER_LENGTH = 8;

/**
 * What a normalised order number must look like before it is worth a query: the
 * first eight characters of a lowercased UUID, i.e. hex.
 */
export const ORDER_NUMBER_PATTERN = /^[0-9a-f]{8}$/;

/**
 * Reduce a number the customer typed to the form the `id` column holds
 * (TASK-483, B-5 §1).
 *
 * A buyer copies the number off an email, a Viber message or a printed slip, so
 * it arrives as `#94F5F971`, `94f5 f971`, `№94F5F971` or with a stray trailing
 * space. Every one of those is the same order, and refusing them would make the
 * form fail for the exact people it exists for. Anything that is not a letter or
 * a digit is dropped and the rest is lowercased — the column stores lowercase
 * UUIDs.
 *
 * NOTE: this normalises, it does not validate. The shape check lives in the
 * service so that a malformed number and an unknown one produce the SAME 404 —
 * see `OrderService.lookupOrders`.
 */
export function normalizeOrderNumber(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}

/**
 * Body of `POST /api/orders/lookup` — the public "check my order" form
 * (TASK-483).
 *
 * ── Why a POST with a body at all ─────────────────────────────────────────────
 * The phone number is the second half of the credential. In a URL it would be
 * copied into access logs, the browser's history, the `Referer` header of every
 * asset the result page loads, and any proxy in between. In a body it is in none
 * of them (B-5 §2).
 *
 * ── Why the validation here is so thin ────────────────────────────────────────
 * Only what protects the SERVER lives here — the two fields are strings and they
 * are bounded. Everything about whether the values could name an order is
 * decided in the service, which answers one identical 404 for "no such order",
 * "not that phone", "expired", "deleted" AND "that is not an order number". A
 * 400 that fired only for a well-formed-but-unknown number would be the one
 * response that tells a guesser they are getting warmer.
 */
export class OrderLookupDto {
  @ApiProperty({
    description:
      'Order number as printed on the confirmation email — the 8-character code, with or ' +
      'without a leading "#", spaces or letter case.',
    example: '#94F5F971',
    maxLength: 64,
  })
  // Runs before the validators below (class-transformer first under the global
  // `transform: true` pipe), so the bound applies to what a human typed.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeOrderNumber(value) : value,
  )
  @IsString()
  @MaxLength(64)
  number!: string;

  @ApiProperty({
    description:
      'Phone number given when the order was placed, in any spelling — it is normalised to ' +
      'the same canonical form the order was stored in (TASK-466).',
    example: '+380 50 111 2233',
    maxLength: 32,
  })
  // The SAME transform the order DTOs use, and that is the whole point. Since
  // TASK-466 the stored columns hold `380XXXXXXXXX`; normalising the query term
  // through `phoneDigits` instead would leave `0501112233` and `380501112233` as
  // two different strings and the form would miss orders that are right there
  // (owner's decision 2026-09-11 — the BACKLOG row naming `phoneDigits` is the
  // correct one; plan 180 line 48 is not).
  @Transform(normalizePhone)
  @IsString()
  @MaxLength(32)
  phone!: string;
}
