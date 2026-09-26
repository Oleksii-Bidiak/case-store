import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { normalizeEmail } from '../../common/validators';

/** Body of `POST /api/auth/email-change/request` (TASK-396). */
export class RequestEmailChangeDto {
  @ApiProperty({
    description:
      'The address to sign in with from now on. Nothing changes until the link sent to it is clicked.',
    example: 'new-address@example.com',
    maxLength: 254,
  })
  // Stored trimmed and lowercased, like every other address (TASK-772).
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  newEmail!: string;

  @ApiProperty({
    description: 'The password currently on the account — a session alone is not enough',
    example: 'OldP@ssw0rd',
  })
  // Presence only, never a strength rule — see ChangePasswordDto.
  @IsString()
  @IsNotEmpty({ message: 'Current password is required' })
  currentPassword!: string;
}

/** Body of `POST /api/auth/email-change/confirm` and `/revert` (TASK-396). */
export class EmailChangeTokenDto {
  @ApiProperty({
    description: 'The single-use token from the emailed link',
    example: 'a1b2c3d4e5f6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token!: string;
}

/**
 * Body of `POST /api/users/:id/email` — the operator's half (TASK-396).
 *
 * `reason` is required: the change is made on somebody's word over the phone,
 * and the audit row (which records this body) is the only place that word is
 * written down.
 */
export class OperatorEmailChangeDto {
  @ApiProperty({
    description:
      'The customer’s new address. It is NOT marked verified — a verification link is sent to it.',
    example: 'new-address@example.com',
    maxLength: 254,
  })
  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(254, { message: 'Email must be at most 254 characters' })
  newEmail!: string;

  @ApiProperty({
    description: 'Why the address is being changed — who asked and how they were identified',
    example: 'Клієнт телефонував 24.09, втратив доступ до пошти; звірили номер замовлення',
    minLength: 5,
    maxLength: 500,
  })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'A reason is required' })
  @MinLength(5, { message: 'Reason must be at least 5 characters' })
  @MaxLength(500, { message: 'Reason must be at most 500 characters' })
  reason!: string;
}
