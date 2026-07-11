import { SlugRedirectEntity } from '@prisma/client';

/**
 * In-memory projection of a `SlugRedirect` row — only the fields the pure
 * chain-collapse transformation cares about. id/timestamps are DB-layer
 * concerns, irrelevant here.
 */
export interface SlugRedirectRow {
  entity: SlugRedirectEntity;
  oldSlug: string;
  newSlug: string;
}

/**
 * Pure chain-collapse reducer for a slug rename (TASK-285-B).
 *
 * See plan 147 §Design Decision 2 for the 3-step algorithm and its proof.
 */
export function applySlugRename(
  rows: SlugRedirectRow[],
  entity: SlugRedirectEntity,
  from: string,
  to: string,
): SlugRedirectRow[] {
  void rows;
  void entity;
  void from;
  void to;
  throw new Error('Not implemented (TDD red phase)');
}
