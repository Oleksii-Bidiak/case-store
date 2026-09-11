import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { IsInternationalPhone, normalizePhone } from '../../common/validators';

/**
 * Contact details a guest supplies at checkout (TASK-338).
 *
 * Required only when there is no account behind the order. For an authenticated
 * shopper the user row remains the source of truth and this block is ignored —
 * letting a signed-in customer redirect their own confirmation email to an
 * arbitrary address would be a small but real account-takeover assist.
 *
 * These three fields are the ONLY way to reach a guest buyer: the confirmation
 * email carries their order-status link, and the phone number is what the courier
 * calls. They are snapshotted onto the order and never rewritten.
 */
export class GuestContactDto {
  @ApiProperty({
    description: 'Email for the confirmation letter and the order-status link',
    example: 'olena@example.com',
    maxLength: 254,
  })
  @IsEmail({}, { message: 'A valid email is required to place a guest order' })
  @MaxLength(254)
  // Normalised at the boundary so the later "claim my guest orders" lookup by
  // email is a plain equality match rather than a case-folding guess.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    description:
      'Phone number the courier can call — any country, 9 to 15 digits (E.164), typed with ' +
      'whatever separators the buyer uses. Stored normalised, as digits only.',
    example: '+380501234567',
    maxLength: 32,
  })
  // TASK-466: was a bare trim, which left the same number stored as `+380 50 111
  // 2233` from the masked storefront field and as `050 111 2233` from an
  // operator's unmasked one — so the admin order search matched at most one of
  // them. The shared transform trims as part of normalising, and runs before the
  // rules below because class-transformer runs first under `transform: true`; it
  // touches only a value that is already a number and nothing else, so what
  // those rules see is unchanged.
  @Transform(normalizePhone)
  @IsString()
  @MaxLength(32)
  // Deliberately NOT Ukrainian-only: a stricter pattern would reject the roaming
  // and border-region numbers real customers order with, and the number is
  // dialled by a human, not parsed (TASK-338; owner's decision restated
  // 2026-09-10 — strict UA validation belongs on the storefront and contact
  // forms, not on the order endpoints).
  //
  // It does, however, count DIGITS rather than mask characters (TASK-407). The
  // old `@Matches(/^\+?[\d\s()-]{9,}$/)` accepted `(((((((((` — nine brackets,
  // no number at all — as the only way to reach a guest buyer.
  @IsInternationalPhone({ message: 'A valid phone number is required' })
  phone!: string;

  @ApiProperty({ description: 'Buyer name', example: 'Олена Шевченко', maxLength: 120 })
  @IsString()
  @MinLength(1, { message: 'A name is required to place a guest order' })
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
