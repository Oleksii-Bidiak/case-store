import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength, Matches } from 'class-validator';

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
    description: 'Phone number the courier can call',
    example: '+380501234567',
    maxLength: 32,
  })
  @IsString()
  @MaxLength(32)
  // Deliberately permissive: digits, spaces, dashes, brackets and a leading plus.
  // A stricter Ukrainian-only pattern would reject the roaming and border-region
  // numbers real customers use, and the number is dialled by a human, not parsed.
  @Matches(/^\+?[\d\s()-]{9,}$/, { message: 'A valid phone number is required' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  phone!: string;

  @ApiProperty({ description: 'Buyer name', example: 'Олена Шевченко', maxLength: 120 })
  @IsString()
  @MinLength(1, { message: 'A name is required to place a guest order' })
  @MaxLength(120)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
