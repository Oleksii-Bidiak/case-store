import { AttributeType } from '@prisma/client';

/**
 * Shared constants for the structured-spec template module (TASK-191).
 */

/**
 * The ONLY types a catalogue facet may have (TASK-488, owner decision B-10:
 * «Фасет — це `SELECT` або `BOOLEAN`»).
 *
 * TEXT is excluded because free text yields as many distinct values as there
 * are products — «Екран: 6.1″ OLED», «Захист: Посилені кути Air Cushion…» —
 * so the facet is a list nobody can use and every value matches exactly one
 * item. NUMBER is excluded for the milder version of the same problem plus a
 * rendering one: a facet checkbox labelled «10000» without its unit says
 * nothing, and the value set is unbounded. A category that wants to filter by
 * either declares a SELECT with a closed option list instead.
 *
 * This is a RULE, not a default: it is enforced when a definition is written
 * (`AttributeDefinitionService.create` / `.update` reject the pair) AND when
 * facets are read (`getFilterableSpecs` drops anything else), because a
 * database that predates the rule can still hold a filterable TEXT row.
 */
export const FACETABLE_TYPES: readonly AttributeType[] = [
  AttributeType.SELECT,
  AttributeType.BOOLEAN,
];

/** Whether a definition of this type may be offered as a catalogue facet. */
export function isFacetableType(type: AttributeType): boolean {
  return FACETABLE_TYPES.includes(type);
}

/**
 * A stable, URL/filter-safe attribute key: starts with a letter, then letters,
 * digits, or hyphens (no spaces). Covers both kebab-case (`screen-size`) and
 * camelCase (`powerOutput`) — mirrors doc 099 §5's "англ. ключ" convention.
 * The SAME pattern is enforced on the admin form (store-admin zod schema).
 */
export const ATTRIBUTE_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9-]*$/;

/**
 * Max number of `isFilterable` specs surfaced as PDP highlights ("Коротко про
 * товар" grid) — keeps the strip compact regardless of how many filterable
 * definitions a category declares.
 */
export const MAX_HIGHLIGHTS = 4;
