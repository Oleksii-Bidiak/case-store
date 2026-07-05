import { IsString, IsOptional, IsBoolean, MaxLength, Matches, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for updating an existing brand (admin-only).
 *
 * All fields are optional — only provided fields will be updated.
 */
export class UpdateBrandDto {
  @ApiProperty({
    description: 'Brand name',
    example: 'Spigen',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'Brand name must be at most 255 characters' })
  name?: string;

  @ApiProperty({
    description: 'URL-friendly slug',
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
    nullable: true,
  })
  @IsOptional()
  @IsUrl({}, { message: 'Logo must be a valid URL' })
  logo?: string;

  @ApiProperty({
    description: 'Whether the brand is active and visible in the store',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be true or false' })
  isActive?: boolean;
}
