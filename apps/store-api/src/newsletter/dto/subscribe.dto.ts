import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body DTO for the public newsletter subscribe endpoint.
 *
 * The email is normalized (trimmed + lowercased) at the DTO boundary so both the
 * uniqueness gate and storage always see the canonical form. `source` is a free
 * short tag identifying the opt-in surface (e.g. `home`, `promo`).
 */
export class SubscribeDto {
  @ApiProperty({ description: 'Subscriber email address', example: 'user@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'A valid email is required' })
  email!: string;

  @ApiProperty({
    description: 'Opt-in surface for attribution (e.g. home, promo, blog)',
    example: 'home',
    required: false,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Source must be at most 50 characters' })
  source?: string;
}
