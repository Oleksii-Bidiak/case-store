import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  IsArray,
  ArrayMaxSize,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating the singleton SEO settings (admin-only).
 *
 * All fields are optional — send only the fields you want to change.
 */
export class UpdateSeoSettingsDto {
  @ApiPropertyOptional({
    description: 'Default meta title used when a page has no own title',
    example: 'MobileStore — аксесуари для смартфонів',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  defaultMetaTitle?: string;

  @ApiPropertyOptional({
    description: 'Default meta description used when a page has no own description',
    example: 'Мультибрендовий магазин аксесуарів та Apple-техніки. Доставка по Україні.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  defaultMetaDescription?: string;

  @ApiPropertyOptional({
    description:
      'Page title template — must contain exactly one `%s` token (replaced by the page name), e.g. "%s | MobileStore"',
    example: '%s | MobileStore',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[^%]*%s[^%]*$/, {
    message: 'titleTemplate must contain exactly one %s token and no other % characters',
  })
  titleTemplate?: string;

  @ApiPropertyOptional({
    description: 'Default Open Graph / social-preview image URL',
    example: 'https://mobilestore.ua/og-default.jpg',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'] }, { message: 'defaultOgImage must be a valid URL' })
  @MaxLength(500)
  defaultOgImage?: string;

  @ApiPropertyOptional({
    description: 'Site-wide noindex kill switch (hides the whole site from search engines)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  noindexSite?: boolean;

  @ApiPropertyOptional({
    description: 'Overrides only the intro paragraph of /llms.txt (AI-assistant map)',
    example: 'Магазин аксесуарів для смартфонів та Apple-техніки в Україні.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  llmsTxtSummary?: string;

  @ApiPropertyOptional({
    description:
      'Additional brand-authority profile URLs merged into the Organization `sameAs` schema',
    example: ['https://facebook.com/mobilestore', 'https://youtube.com/@mobilestore'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl(
    { protocols: ['http', 'https'] },
    { each: true, message: 'each sameAs link must be a valid URL' },
  )
  @MaxLength(500, { each: true })
  additionalSameAsLinks?: string[];
}
