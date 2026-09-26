import { SlugRedirectEntity } from '@prisma/client';

/**
 * In-memory projection of a `SlugRedirect` row — only the fields the pure
 * chain-collapse transformation cares about. id/timestamps are DB-layer
 * concerns, irrelevant here.
 *
 * `scope` / `newScope` (TASK-566) are the namespaces of the dead and the live
 * address: for PAGE the page kind whose route serves the slug (`LEGAL`,
 * `INFO`), '' for every single-namespace entity.
 */
export interface SlugRedirectRow {
  entity: SlugRedirectEntity;
  scope: string;
  oldSlug: string;
  newScope: string;
  newSlug: string;
}

/**
 * One public address of an entity: a slug inside a namespace (TASK-566). A
 * bare slug is the empty namespace, which is what every entity with a single
 * route family (blog posts, products, categories, device models) uses.
 */
export interface SlugAddress {
  scope: string;
  slug: string;
}

/** Normalise a bare slug into an address in the empty namespace. */
export function toSlugAddress(value: string | SlugAddress): SlugAddress {
  return typeof value === 'string' ? { scope: '', slug: value } : value;
}

/**
 * Pure chain-collapse reducer for a slug rename (TASK-285-B).
 *
 * Models the exact 3-statement transaction `SlugRedirectRepository.recordRename`
 * executes against Postgres (plan 147 §Design Decision 2), over an in-memory
 * row array. Input arrays/rows are never mutated — a new array of new row
 * objects is returned.
 *
 * Every comparison is between ADDRESSES — `(scope, slug)` — never bare slugs
 * (TASK-566): `/legal/B` and `/info/B` are two pages, so renaming one must
 * neither overwrite nor repoint the other's aliases, and a kind move that keeps
 * the slug (`LEGAL:B → INFO:B`) is a rename like any other.
 *
 * Steps, unconditionally in order:
 * 1. Upsert `(entity, from) → to`.
 * 2. Repoint every OTHER row of this entity whose target is `from` to `to`
 *    (the chain collapse — keeps every alias one hop from the live address).
 * 3. Delete the self-loop `to → to` if step 2 produced one (the rename-back /
 *    undo case).
 *
 * Defensive guard: a call whose address does not change (should be prevented
 * upstream by the "slug actually changed" gate) is a no-op — no self row is
 * ever created.
 */
export function applySlugRename(
  rows: SlugRedirectRow[],
  entity: SlugRedirectEntity,
  fromInput: string | SlugAddress,
  toInput: string | SlugAddress,
): SlugRedirectRow[] {
  const from = toSlugAddress(fromInput);
  const to = toSlugAddress(toInput);
  const next = rows.map((r) => ({ ...r }));
  if (from.scope === to.scope && from.slug === to.slug) return next;

  const isTarget = (r: SlugRedirectRow) => r.entity === entity;
  const isFromAddress = (r: SlugRedirectRow) => r.scope === from.scope && r.oldSlug === from.slug;

  // Step 1: upsert (entity, from) → to.
  const existing = next.find((r) => isTarget(r) && isFromAddress(r));
  if (existing) {
    existing.newScope = to.scope;
    existing.newSlug = to.slug;
  } else {
    next.push({
      entity,
      scope: from.scope,
      oldSlug: from.slug,
      newScope: to.scope,
      newSlug: to.slug,
    });
  }

  // Step 2: repoint (collapse) every other row of this entity pointing at `from`.
  for (const r of next) {
    if (isTarget(r) && !isFromAddress(r) && r.newScope === from.scope && r.newSlug === from.slug) {
      r.newScope = to.scope;
      r.newSlug = to.slug;
    }
  }

  // Step 3: delete the self-loop step 2 may have created (rename-back case).
  return next.filter(
    (r) =>
      !(
        isTarget(r) &&
        r.scope === to.scope &&
        r.oldSlug === to.slug &&
        r.newScope === to.scope &&
        r.newSlug === to.slug
      ),
  );
}
