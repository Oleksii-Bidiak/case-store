import { IsString, IsOptional, IsEmail, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInternationalPhone, normalizeEmail } from '../../common/validators';

/**
 * DTO for updating the singleton site-contact settings (admin-only).
 *
 * All fields are optional — send only the fields you want to change.
 */
export class UpdateSiteContactDto {
  @ApiPropertyOptional({
    description: 'Support email address',
    example: 'support@casestore.ua',
  })
  @IsOptional()
  @Transform(normalizeEmail) // TASK-772
  @IsEmail({}, { message: 'Email must be a valid email address' })
  // TASK-1984 (forms Rule 5c): 254 like every other email the API takes — the
  // admin form's `emailField` has the same cap.
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description:
      'Support phone number: 9 to 15 digits with the usual separators. Stored as typed ' +
      '(no normalisation), so a 0 800 line is shown and dialled as written.',
    example: '+380 44 000 0000',
  })
  @IsOptional()
  @IsString()
  // TASK-1984 (forms Rule 5a): the shop's own number may be a 0 800 or a foreign
  // line, so the country-agnostic rule — and deliberately NO `normalizePhone`
  // transform: the storefront shows the number exactly as the owner typed it.
  @IsInternationalPhone()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Working hours (free-form text)',
    example: 'Пн–Нд: 9:00 – 20:00',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workingHours?: string;

  @ApiPropertyOptional({
    description: 'Viber contact link',
    example: 'https://viber.me/example',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] }, { message: 'Viber link must be a valid URL' })
  @MaxLength(500)
  viberLink?: string;

  @ApiPropertyOptional({
    description: 'Telegram contact link',
    example: 'https://t.me/example',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] }, { message: 'Telegram link must be a valid URL' })
  @MaxLength(500)
  telegramLink?: string;

  @ApiPropertyOptional({
    description: 'Instagram profile link',
    example: 'https://instagram.com/example',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] }, { message: 'Instagram link must be a valid URL' })
  @MaxLength(500)
  instagramLink?: string;
}
