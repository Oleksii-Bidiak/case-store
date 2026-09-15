/**
 * Shared bits of the slug-shaped catalogue filter params (TASK-420), used by
 * BOTH `ProductListQueryDto` and `SearchQueryDto` — `/search` migrated together
 * with the catalogue so there is no "slug here, uuid there" split.
 */

/**
 * Upper bound on a filter slug. Generous next to real slugs (a few dozen
 * characters) and small enough that the value is bounded before it reaches a
 * `findUnique`. Slugs are NOT pattern-validated: an unrecognised value degrades
 * to an empty result page rather than a 400 (see `CatalogueFilterResolver`), so
 * a regex here would only convert one harmless miss into a hard error.
 */
export const SLUG_MAX_LENGTH = 120;

/**
 * Treat `?brand=` (present but empty) as absent.
 *
 * Without it an empty param would reach the resolver, fail to resolve and pin
 * the listing to zero results — a filter the shopper never applied. Reads the
 * ORIGINAL value off `obj` for the same reason every boolean transform in these
 * DTOs does: the global ValidationPipe runs with `enableImplicitConversion`.
 */
export function blankToUndefined({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): string | undefined {
  const raw = obj[key];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}
