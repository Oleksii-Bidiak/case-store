import { z } from "zod";
import type {
  SearchSynonymsEntity,
  UpdateSearchSynonymsDto,
} from "@/entities/search-synonyms";
import { dict } from "@/shared/config";

const e = dict.searchSynonyms.errors;

/**
 * Limits — mirror of the API's `update-search-synonyms.dto.ts`. Keep them in
 * step: a looser form only earns the operator a generic 400 instead of a hint
 * under the row.
 */
export const SYNONYM_GROUPS_MAX = 300;
export const SYNONYM_TERMS_MIN = 2;
export const SYNONYM_TERMS_MAX = 20;
export const SYNONYM_TERM_MAX_LENGTH = 40;

/**
 * One word the engine can match: letters and digits in any script. Meilisearch
 * matches a synonym against one query word, and the indexer splits text at
 * every other character — so «type-c» or «пам'ять» could never match and would
 * only look like they work.
 */
const TERM = /^[\p{L}\p{N}]+$/u;

/**
 * The operator types a group as one comma-separated line. Parsed the way the
 * API normalises it: trimmed, lowercased, blanks dropped, duplicates folded —
 * so «Чохол, чохол» is ONE word and the two-word minimum catches it here.
 */
export function parseSynonymTerms(raw: string | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const term = part.trim().toLowerCase();
    if (term) seen.add(term);
  }
  return [...seen];
}

const groupSchema = z
  .object({ terms: z.string() })
  .superRefine((group, ctx) => {
    const terms = parseSynonymTerms(group.terms);
    // A row left blank is dropped on save, not reported — adding a row and not
    // filling it is not a mistake worth a red message.
    if (terms.length === 0) return;
    const report = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["terms"], message });

    const notOneWord = terms.find((term) => !TERM.test(term));
    if (notOneWord) return report(e.notOneWord(notOneWord));
    if (terms.some((term) => term.length > SYNONYM_TERM_MAX_LENGTH)) {
      return report(e.tooLong(SYNONYM_TERM_MAX_LENGTH));
    }
    if (terms.length < SYNONYM_TERMS_MIN) return report(e.tooFew);
    if (terms.length > SYNONYM_TERMS_MAX) {
      return report(e.tooMany(SYNONYM_TERMS_MAX));
    }
  });

/**
 * The synonym-list form. INPUT: one comma-separated line per group. OUTPUT:
 * the parsed groups with blank rows dropped — exactly the PUT body.
 */
export const searchSynonymsSchema = z
  .object({
    groups: z
      .array(groupSchema)
      .max(SYNONYM_GROUPS_MAX, e.tooManyGroups(SYNONYM_GROUPS_MAX)),
  })
  .transform((values): UpdateSearchSynonymsDto => ({
    groups: values.groups
      .map((group) => ({ terms: parseSynonymTerms(group.terms) }))
      .filter((group) => group.terms.length > 0),
  }));

export type SearchSynonymsFormInput = z.input<typeof searchSynonymsSchema>;
export type SearchSynonymsFormValues = z.output<typeof searchSynonymsSchema>;

/** Server list → form rows (one comma-separated line per group). */
export function mapSynonymsToFormValues(
  settings: Pick<SearchSynonymsEntity, "groups">,
): SearchSynonymsFormInput {
  return {
    groups: settings.groups.map((group) => ({ terms: group.terms.join(", ") })),
  };
}
