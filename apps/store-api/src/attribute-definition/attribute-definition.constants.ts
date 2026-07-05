/**
 * Shared constants for the structured-spec template module (TASK-191).
 */

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
