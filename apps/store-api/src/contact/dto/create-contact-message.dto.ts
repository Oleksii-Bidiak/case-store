import { IsString, IsOptional, IsEmail, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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

  @ApiProperty({ description: 'Contact phone number', example: '+380671234567' })
  @Transform(trim)
  @IsString()
  @MinLength(5, { message: 'Phone must be at least 5 characters' })
  @MaxLength(32, { message: 'Phone must be at most 32 characters' })
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
