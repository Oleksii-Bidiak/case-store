import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

/** Longest a single tag may be. Tags are tokens, not sentences. */
export const MAX_TAG_LENGTH = 50;

/** How many tags one asset may carry. */
export const MAX_TAGS_PER_ASSET = 20;

/** Longest alt text. Screen readers stop being helped well before this. */
export const MAX_ALT_LENGTH = 300;

/**
 * Normalise whatever arrived in a `tags` field into a clean string array.
 *
 * It has to cope with three shapes because the two callers differ: JSON bodies
 * send a real array, while a MULTIPART form sends either one repeated field
 * (which Express hands over as an array) or a single comma-separated string —
 * and the browser's `FormData` gives no way to express an empty array at all.
 * Normalising at the boundary is what keeps that mess out of the service.
 *
 * Trims, drops blanks, and de-duplicates case-insensitively while preserving the
 * spelling the operator typed first: «Банер» and «банер» are one tag, and a
 * library where they are two is a library where filtering silently misses half
 * the assets.
 */
export function normaliseTags(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value : String(value).split(',');
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const entry of raw) {
    const tag = String(entry).trim();
    if (!tag) {
      continue;
    }
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

/** The editable metadata of a media asset, shared by the upload and PATCH bodies. */
export class MediaMetadataDto {
  @ApiProperty({
    description: 'Alternative text shared by every consumer of this asset',
    example: 'Смартфон Apple iPhone 16 Pro — вигляд спереду',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ALT_LENGTH, { message: `Alt text must be at most ${MAX_ALT_LENGTH} characters` })
  alt?: string;

  @ApiProperty({
    description:
      'Operator tags. Accepts a JSON array, a repeated multipart field, or one ' +
      'comma-separated string; duplicates differing only in case are collapsed.',
    type: [String],
    example: ['iphone', 'банер'],
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => normaliseTags(value))
  @IsArray({ message: 'Tags must be a list' })
  @ArrayMaxSize(MAX_TAGS_PER_ASSET, {
    message: `At most ${MAX_TAGS_PER_ASSET} tags per asset`,
  })
  @IsString({ each: true })
  @MaxLength(MAX_TAG_LENGTH, {
    each: true,
    message: `Each tag must be at most ${MAX_TAG_LENGTH} characters`,
  })
  tags?: string[];
}
