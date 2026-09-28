import { IsEmail, IsString, MaxLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  CUSTOMER_PASSWORD_DESCRIPTION,
  IsCustomerPassword,
  normalizeEmail,
} from '../../common/validators';

/**
 * The registration honeypot's field name (TASK-749). Deliberately meaningless:
 * `website` — the contact form's trap — is a real field in 1Password's
 * "Internet Details", Bitwarden identities and Safari cards, so a filler that
 * offers an identity writes into it. A name no filler has a profile slot for is
 * the cheaper half of the defence; the storefront's `Honeypot` adds the opt-out
 * attributes the fillers actually read.
 */
export const REGISTER_HONEYPOT_FIELD = 'hpCheck' satisfies keyof RegisterDto;

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    maxLength: 254,
  })
  // TASK-772: one address, one account — stored trimmed and lowercased.
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  email!: string;

  @ApiProperty({
    description: `User password (${CUSTOMER_PASSWORD_DESCRIPTION})`,
    example: 'strongp@ss123',
    minLength: 8,
  })
  @IsCustomerPassword()
  password!: string;

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

  /**
   * Honeypot (TASK-749). Declared because the global pipe runs with
   * `forbidNonWhitelisted`: an undeclared key would answer a bot with a 400 that
   * names the field — telling it exactly what to leave out. Bounded like any
   * string; any non-empty value makes the API answer as if it had registered and
   * create nothing (`AuthService.register`).
   */
  @ApiProperty({
    description:
      'Leave empty or omit it. Present only so the storefront form can carry a field that ' +
      'people never see; a request that fills it creates no account.',
    required: false,
    maxLength: 255,
  })
  // Trimmed, so a filler that writes only whitespace is not taken for a bot.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(255)
  hpCheck?: string;
}
