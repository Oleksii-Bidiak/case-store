import { IsString, IsOptional, IsEmail, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsUaPhone, normalizePhone } from '../../common/validators';

/**
 * Trim a string value coming off the request body. Non-string values pass
 * through untouched so the type-checking decorators produce the right error.
 */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

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
   * `normalizePhone` replaces the plain trim so the value that reaches the
   * repository is the canonical `380XXXXXXXXX`, whatever separators (or mask)
   * it arrived with. It was local to this DTO until TASK-466 gave the two order
   * DTOs the same treatment; there is now exactly one copy, in
   * `common/validators/normalize-phone.transform.ts`.
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
