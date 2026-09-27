import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Most groups one list may hold. The built-in dictionary has ~50. */
export const SYNONYM_GROUPS_MAX = 300;
/** A group of one word says nothing. */
export const SYNONYM_TERMS_MIN = 2;
/** Most words in one group. The largest built-in group has 7. */
export const SYNONYM_TERMS_MAX = 20;
/** Longest single term. */
export const SYNONYM_TERM_MAX_LENGTH = 40;

/**
 * One word: letters and digits in any script, nothing else.
 *
 * The rule is the engine's, not a style choice. Meilisearch matches a synonym
 * against ONE normalised query word, and the document-side injection
 * (`extractSearchSynonymTerms`) looks words up after splitting the text at every
 * non-letter/digit — so a term with a space, a hyphen or an apostrophe
 * («пам'ять», «type-c») could never match anything and would sit in the list
 * looking like it works.
 */
export const SYNONYM_TERM_PATTERN = /^[\p{L}\p{N}]+$/u;

/**
 * Trim, lowercase and de-duplicate a group's terms, dropping blanks.
 *
 * Runs BEFORE validation, so «Чохол, чохол» is one term (and then fails the
 * two-term minimum) rather than two, and the size limits count what will
 * actually be stored. Non-strings pass through untouched for `@IsString` to
 * reject.
 */
export function normalizeSynonymTerms(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  const terms: unknown[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') {
      terms.push(raw);
      continue;
    }
    const term = raw.trim().toLowerCase();
    if (term.length === 0 || seen.has(term)) continue;
    seen.add(term);
    terms.push(term);
  }
  return terms;
}

export class SearchSynonymGroupDto {
  @ApiProperty({
    description:
      'Words search treats as the same word, both directions. Trimmed, lowercased and de-duplicated on the way in; each must be ONE word (letters/digits only).',
    example: ['чохол', 'чохли', 'case', 'cases'],
    type: [String],
    minItems: SYNONYM_TERMS_MIN,
    maxItems: SYNONYM_TERMS_MAX,
  })
  // Read from `obj`, not `value`: the global `enableImplicitConversion` must not
  // get a say in what the array holds before the normaliser has run.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => normalizeSynonymTerms(obj.terms))
  @IsArray({ message: 'terms must be an array of words' })
  @ArrayMinSize(SYNONYM_TERMS_MIN, {
    message: `Each synonym group needs at least ${SYNONYM_TERMS_MIN} different words`,
  })
  @ArrayMaxSize(SYNONYM_TERMS_MAX, {
    message: `A synonym group may hold at most ${SYNONYM_TERMS_MAX} words`,
  })
  @IsString({ each: true, message: 'Each synonym must be text' })
  @MaxLength(SYNONYM_TERM_MAX_LENGTH, {
    each: true,
    message: `Each synonym must be at most ${SYNONYM_TERM_MAX_LENGTH} characters`,
  })
  @Matches(SYNONYM_TERM_PATTERN, {
    each: true,
    message:
      'Each synonym must be a single word: letters and digits only, no spaces, hyphens or apostrophes',
  })
  terms!: string[];
}

/**
 * PUT body: the WHOLE list. It replaces whatever was saved; an empty `groups`
 * array clears the saved list, which puts search back on the built-in
 * dictionary.
 */
export class UpdateSearchSynonymsDto {
  @ApiProperty({ type: [SearchSynonymGroupDto], maxItems: SYNONYM_GROUPS_MAX })
  @IsArray({ message: 'groups must be an array' })
  @ArrayMaxSize(SYNONYM_GROUPS_MAX, {
    message: `At most ${SYNONYM_GROUPS_MAX} synonym groups`,
  })
  @ValidateNested({ each: true })
  @Type(() => SearchSynonymGroupDto)
  groups!: SearchSynonymGroupDto[];
}
