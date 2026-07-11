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
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Accepts either a bare verification token or a full `<meta ...>` tag copy-pasted
 * from a search console's "HTML tag" instructions, and returns just the token (the
 * `content` attribute value). Falls back to a plain trim when no `content=` attribute
 * is found, so a bare token — the expected common case — passes through unchanged.
 *
 * Intentionally duplicated (not import-shared) with store-admin's
 * `features/seo-settings-form/model/seo-settings-schema.ts` — the two apps share no
 * logic package (same choice as `resolve-seo-preview.ts`, TASK-268). Keep both copies
 * in sync. See plan 146 Design Decision 1.
 */
export function normalizeSiteVerificationValue(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/content=["']([^"']+)["']/i);
  return match ? match[1] : trimmed;
}

/**
 * `@Transform` wrapper: non-string values pass through untouched so the
 * type-checking decorators produce the right error (same file-local-helper
 * convention as `CreateContactMessageDto`'s `trim`).
 */
const normalizeVerification = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeSiteVerificationValue(value) : value;

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
    description:
      'Google Search Console ownership-verification token (HTML-tag method). Accepts either the bare token or the full pasted `<meta>` tag — normalized to the token on write.',
    example: 'AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
  })
  @IsOptional()
  @Transform(normalizeVerification)
  @IsString()
  @MaxLength(255)
  googleSiteVerification?: string;

  @ApiPropertyOptional({
    description:
      'Bing Webmaster Tools ownership-verification token (HTML-tag method, `msvalidate.01`). Accepts either the bare token or the full pasted `<meta>` tag — normalized to the token on write.',
    example: '1234ABCD5678EFGH9012IJKL3456MNOP',
  })
  @IsOptional()
  @Transform(normalizeVerification)
  @IsString()
  @MaxLength(255)
  bingSiteVerification?: string;

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
