import { IsString, IsOptional, IsEmail, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsUaPhone, normalizeUaPhone } from '../../common/validators';

/**
 * Trim a string value coming off the request body. Non-string values pass
 * through untouched so the type-checking decorators produce the right error.
 */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Store one number in one shape (TASK-407).
 *
 * The storefront field is masked, so the wire value is now `+380 50 111 2233`
 * where it used to be whatever the shopper typed. Persisting that would leave
 * `ContactMessage.phone` holding three spellings of the same number — the mask,
 * the old free-form rows and whatever an API client sends — and any admin-side
 * lookup or grouping by phone would silently miss most of them. Normalising
 * here, at the boundary, means the column only ever gains the canonical
 * digits-only form `380XXXXXXXXX`.
 *
 * Non-string values pass through so `@IsString()` still reports the type error,
 * and an unrecognisable string reduces to its bare digits and is then refused by
 * {@link IsUaPhone} — normalisation never rescues an invalid number.
 */
const normalizePhone = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeUaPhone(value.trim()) : value;

/**
 * DTO for a public contact-message submission (storefront contact form).
 *
 * All string inputs are trimmed before validation. `message` is stored as plain
 * text — it is never rich HTML and is escaped by the frontend on render, so no
 * sanitize-html pass runs on it.
 */
export class CreateContactMessageDto {
  @ApiProperty({ description: 'Sender full name', example: 'Ivan Petrenko' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(120, { message: 'Name must be at most 120 characters' })
  name!: string;

  /**
   * The number an operator will dial back (TASK-407). It had no format rule at
   * all — `@MinLength(5)` accepted `12345` — which is how the contact queue
   * collected messages nobody could answer. `@IsUaPhone` normalises the
   * separators away and then requires `380` + 9 digits; `@MaxLength` stays as a
   * bound on what gets stored, not as the format check it was standing in for.
   *
   * {@link normalizePhone} replaces the plain trim so the value that reaches the
   * repository is the canonical `380XXXXXXXXX`, whatever separators (or mask)
   * it arrived with.
   */
  @ApiProperty({
    description:
      'Contact phone number (Ukrainian: +380 and 9 digits, any separators). ' +
      'Stored normalised, as digits only.',
    example: '+380671234567',
  })
  @Transform(normalizePhone)
  @IsString()
  @MaxLength(32, { message: 'Phone must be at most 32 characters' })
  @IsUaPhone()
  phone!: string;

  @ApiProperty({ description: 'Contact email address', example: 'ivan@example.com' })
  @Transform(trim)
  @IsEmail({}, { message: 'A valid email is required' })
  @MaxLength(255, { message: 'Email must be at most 255 characters' })
  email!: string;

  @ApiProperty({
    description: 'Message body (plain text)',
    example: 'Доброго дня! Хотів би дізнатись про наявність...',
  })
  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Message must be at least 10 characters' })
  @MaxLength(5000, { message: 'Message must be at most 5000 characters' })
  message!: string;

  @ApiProperty({
    description: 'Topic key selected on the form (free text)',
    example: 'order',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60, { message: 'Topic must be at most 60 characters' })
  topic?: string;

  @ApiProperty({
    description: 'Optional order reference the customer typed in',
    example: 'ORD-10231',
    required: false,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120, { message: 'Order reference must be at most 120 characters' })
  orderRef?: string;
}
