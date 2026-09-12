import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Most rows carry a handful of tags; twenty is already an editorial smell. */
export const KEYWORDS_MAX_COUNT = 20;

/** A "tag" longer than this is a sentence — and a sentence is not a tag. */
export const KEYWORD_MAX_LENGTH = 60;

/** Image URLs share the blog cover's limit — see `coverImageUrl`. */
export const OG_IMAGE_MAX_LENGTH = 2048;

/**
 * `class-transformer` transform for a keywords array: trim every entry, drop the
 * blanks, and collapse case-insensitive duplicates (keeping the first spelling).
 *
 * Normalising here rather than in each service means the four modules that carry
 * the field cannot drift, and that `["", "  ", "MagSafe", "magsafe"]` — which a
 * split-on-comma client produces on its own — is stored as `["MagSafe"]` instead
 * of being either rejected with a confusing 400 or saved as junk.
 *
 * Non-array values pass through untouched so `@IsArray()` still reports the type
 * error rather than a normalised lie (same convention as `normalizePhone`).
 */
export const normalizeKeywords = ({ value }: { value: unknown }): unknown => {
  if (!Array.isArray(value)) return value;

  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const entry of value) {
    // A non-string entry is handed on untouched: @IsString({ each: true }) must
    // be the one to refuse it.
    if (typeof entry !== 'string') {
      out.push(entry);
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
};

/**
 * The `keywords` field of a content entity (TASK-437) — Product, Category, Page
 * and BlogPost all use this one decorator so their contract, their limits and
 * their OpenAPI description cannot drift apart.
 *
 * READ THIS BEFORE "FINISHING" THE FEATURE: these are NOT `<meta name="keywords">`
 * values. Google dropped that tag as a ranking signal in 2009, and the storefront
 * deliberately renders no such tag — nothing in `<head>` reads this field. Adding
 * the tag would buy zero ranking and publish the exact term list we target to
 * every competitor. The field is an INTERNAL tag vocabulary: admin-curated
 * synonyms a shopper might type that the name and description do not contain,
 * for store search and AI-summary surfaces.
 *
 * Absent (`undefined`) leaves the stored tags alone; an empty array clears them.
 * There is no `null` form — a list clears by being empty.
 */
export function IsKeywordsField(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      description:
        'Internal content tags — NOT rendered as `<meta name="keywords">` (ignored by ' +
        'Google since 2009 and never emitted by the storefront). Admin-curated synonyms ' +
        'for internal search and AI-summary surfaces. Send [] to clear.',
      example: ['magsafe', 'ударостійкий', 'подарунок'],
      type: [String],
      required: false,
    }),
    IsOptional(),
    Transform(normalizeKeywords),
    IsArray({ message: 'keywords must be an array of strings' }),
    ArrayMaxSize(KEYWORDS_MAX_COUNT, {
      message: `keywords must contain at most ${KEYWORDS_MAX_COUNT} tags`,
    }),
    IsString({ each: true, message: 'each keyword must be a string' }),
    MaxLength(KEYWORD_MAX_LENGTH, {
      each: true,
      message: `each keyword must be at most ${KEYWORD_MAX_LENGTH} characters`,
    }),
  );
}

/**
 * The `ogImage` field of a content entity (TASK-437) — the link-preview picture
 * an admin chose for one row, which outranks both the row's own automatic image
 * (product photo, blog cover) and the global `SeoSettings.defaultOgImage`.
 *
 * `require_tld: false` for the same reason the category image and the blog cover
 * carry it: `http://localhost:3001/uploads/…` is what store-api itself serves in
 * dev, and the default (`require_tld: true`) would 400 every save made against a
 * seeded database. `javascript:` and bare relative paths are still refused.
 *
 * Explicit `null` is accepted on BOTH create and update — it is how the admin
 * forms clear the field (blank input → null), and the same mapper then serves
 * both verbs. `undefined` means "leave it alone".
 */
export function IsOgImageField(): PropertyDecorator {
  return applyDecorators(
    ApiProperty({
      description:
        'Open Graph / social-preview image URL for this row. Wins over the row’s own ' +
        'image and over the global SeoSettings.defaultOgImage. Send null to clear.',
      example: 'https://cdn.example.com/og/iphone-15-case.jpg',
      required: false,
      nullable: true,
      type: String,
    }),
    IsOptional(),
    // Allow an explicit `null` (clear → fall back to the automatic chain); only
    // URL-validate a real value.
    ValidateIf((_, value) => value !== null),
    IsUrl(
      { require_tld: false, protocols: ['http', 'https'] },
      { message: 'ogImage must be a valid URL' },
    ),
    MaxLength(OG_IMAGE_MAX_LENGTH, {
      message: `ogImage must be at most ${OG_IMAGE_MAX_LENGTH} characters`,
    }),
  );
}
