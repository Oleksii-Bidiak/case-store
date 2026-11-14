import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  MaxLength,
  Matches,
  IsUrl,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { trimString } from '../../common/utils';

/**
 * The image-link rule, shared with `IsOgImageField` and the admin's `isHttpUrl`
 * (TASK-1984, forms Rule 5): an absolute http(s) URL. `require_protocol` keeps a
 * bare host (`cdn.example.com/x.png`) out — the storefront would resolve it against
 * its own origin; `require_tld: false` lets `http://localhost:3001/uploads/…`, what
 * store-api itself serves in dev, through (TASK-364).
 */
export const BRAND_LOGO_URL_OPTIONS = {
  require_tld: false,
  require_protocol: true,
  protocols: ['http', 'https'],
};

/**
 * DTO for creating a new brand (admin-only).
 *
 * Slug is auto-generated from name if not provided. Logo is a plain URL/text
 * input (no dedicated upload pipeline in TASK-189).
 */
export class CreateBrandDto {
  @ApiProperty({
    description: 'Brand name',
    example: 'Spigen',
  })
  // TASK-1984 (forms Rule 5d): the admin form refuses a blank name, so the API
  // does too — trimmed first, so "   " is blank rather than a name.
  @Transform(trimString)
  @IsString()
  @IsNotEmpty({ message: 'Brand name must not be empty' })
  @MaxLength(255, { message: 'Brand name must be at most 255 characters' })
  name!: string;

  @ApiProperty({
    description: 'URL-friendly slug (auto-generated from name if not provided)',
    example: 'spigen',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Slug must be at most 255 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug must be lowercase, contain only letters, numbers, and hyphens, and not start or end with a hyphen',
  })
  slug?: string;

  @ApiProperty({
    description: 'URL of the brand logo',
    example: 'https://example.com/logos/spigen.svg',
    required: false,
  })
  @IsOptional()
  @IsUrl(BRAND_LOGO_URL_OPTIONS, { message: 'Logo must be a valid URL' })
  logo?: string;

  @ApiProperty({
    description: 'Whether the brand is active and visible in the store',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
