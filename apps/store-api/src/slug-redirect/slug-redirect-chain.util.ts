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
 * Models the exact 3-statement transaction `SlugRedirectRepository.recordRename`
 * executes against Postgres (plan 147 §Design Decision 2), over an in-memory
 * row array. Input arrays/rows are never mutated — a new array of new row
 * objects is returned.
 *
 * Steps, unconditionally in order:
 * 1. Upsert `(entity, oldSlug: from) → newSlug: to`.
 * 2. Repoint every OTHER row of this entity whose `newSlug === from` to `to`
 *    (the chain collapse — keeps every alias one hop from the live slug).
 * 3. Delete the self-loop `(entity, oldSlug: to, newSlug: to)` if step 2
 *    produced one (the rename-back / undo case).
 *
 * Defensive guard: a `from === to` call (should be prevented upstream by the
 * "slug actually changed" gate) is a no-op — no self row is ever created.
 */
export function applySlugRename(
  rows: SlugRedirectRow[],
  entity: SlugRedirectEntity,
  from: string,
  to: string,
): SlugRedirectRow[] {
  const next = rows.map((r) => ({ ...r }));
  if (from === to) return next;

  const isTarget = (r: SlugRedirectRow) => r.entity === entity;

  // Step 1: upsert (entity, oldSlug: from) → newSlug: to.
  const existing = next.find((r) => isTarget(r) && r.oldSlug === from);
  if (existing) {
    existing.newSlug = to;
  } else {
    next.push({ entity, oldSlug: from, newSlug: to });
  }

  // Step 2: repoint (collapse) every other row of this entity pointing at `from`.
  for (const r of next) {
    if (isTarget(r) && r.oldSlug !== from && r.newSlug === from) {
      r.newSlug = to;
    }
  }

  // Step 3: delete the self-loop step 2 may have created (rename-back case).
  return next.filter((r) => !(isTarget(r) && r.oldSlug === to && r.newSlug === to));
}
