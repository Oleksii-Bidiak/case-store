import { IsOptional, IsEmail, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsUaPhone, normalizeEmail, normalizePhone } from '../../common/validators';

/**
 * DTO for updating the authenticated user's profile.
 *
 * Changeable fields: firstName, lastName, phone. Role and isActive are
 * admin-only operations and have no field here.
 *
 * `email` is still accepted, but only as a repeat of the address the account
 * already has — a client that echoes the whole profile back keeps working,
 * while an actual change is refused by `UserService.updateProfile` (TASK-372).
 * The field is deliberately NOT removed: dropping it would make the global
 * `forbidNonWhitelisted` pipe answer a bare "property email should not exist",
 * which tells an API consumer nothing about where address changes DO live.
 */
export class UpdateProfileDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    required: false,
  })
  @IsOptional()
  // TASK-772: compared against the stored (lowercased) address, so `A@B.com`
  // echoed back for an account stored as `a@b.com` is a repeat, not a change.
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'First name must be at most 100 characters' })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Last name must be at most 100 characters' })
  lastName?: string;

  @ApiProperty({
    description:
      'User phone number: a Ukrainian number (+380 followed by 9 digits), typed with ' +
      'any of `+ ( ) . -` and spaces as separators — letters or an extension are refused. ' +
      'Stored normalised as `380XXXXXXXXX`. Omit the field to leave the number unchanged; ' +
      'send `null` (or an empty string) to REMOVE it. Anything else that is not a ' +
      'dialable number — e.g. `----------` — is refused with 400, never stored as empty.',
    example: '+380991234567',
    required: false,
    nullable: true,
    type: String,
  })
  // TASK-466: the third write path into `users.phone`, and the one a customer
  // drives. The storefront profile field is unmasked, so `050 111 2233` and
  // `+380 50 111 2233` both reached the column verbatim — which is the same
  // several-spellings-of-one-number defect the order DTOs had, and it would have
  // re-dirtied the column the backfill migration just canonicalised and the
  // admin order search reads (`user: { phone: { contains: … } }`).
  //
  // TASK-799: and it had no FORMAT rule at all. `----------` is phone-shaped to
  // the normaliser, reduces to zero digits and was stored as an empty string —
  // the customer's number silently erased, after which an operator cannot find
  // them by phone (TASK-466). `+1 234 567 8901` went through as `12345678901`
  // and checkout displayed it as an invented `+380 12 345 6789`. Removal is
  // something the client has to SAY: `null`, or an empty string, which the
  // transform below turns into `null` before validation.
  //
  // TASK-1984 (D1): the rule is `@IsUaPhone`, not `@IsInternationalPhone`. This
  // is the shopper's OWN number and the storefront profile form only accepts a
  // UA one, so the client and the server now answer to the same rule (forms
  // convention, Rule 5a) — under the international rule `050 111 2233 ccc`
  // passed the form and came back as a generic toast (SF-ACC-36). The order
  // endpoints keep `@IsInternationalPhone` (TASK-338): an operator may take a
  // foreign number by phone, which is not this endpoint.
  @Transform(normalizeProfilePhone)
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Phone number must be at most 30 characters' })
  @IsUaPhone()
  phone?: string | null;
}

/**
 * `''` / whitespace → `null` (an explicit "remove my number"); everything else
 * goes through the shared {@link normalizePhone}. Order matters: the blank check
 * runs on the RAW value, so a value that only normalises to empty (`----------`)
 * is not mistaken for a removal and reaches `@IsUaPhone`, which refuses it
 * for having no digits.
 */
function normalizeProfilePhone(params: { value: unknown }): unknown {
  const { value } = params;
  if (typeof value === 'string' && value.trim() === '') return null;
  return normalizePhone(params);
}
