import { IsString, IsOptional, IsEmail, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating the singleton site-contact settings (admin-only).
 *
 * All fields are optional — send only the fields you want to change.
 */
export class UpdateSiteContactDto {
  @ApiPropertyOptional({
    description: 'Support email address',
    example: 'support@mobilestore.ua',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Support phone number (free-form)',
    example: '+380 44 000 0000',
  })
  @IsOptional()
  @IsString()
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
