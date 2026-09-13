-- TASK-428 — give FAQ items, static pages and carousels a real sort order.
--
-- WHY: all three repositories defaulted a new row's `sort_order` to 0, and the admin forms
-- exposed the number as a field nobody filled in. So every row in these three tables is 0
-- today: the lists have no order at all, only whatever sequence the tiebreaker
-- (`created_at`) happens to produce. From now on a new row is appended (`max + 1`) and the
-- order is changed by dragging, which needs each bucket to be a contiguous 0..n-1 sequence.
--
-- WHAT: renumber every row 0..n-1 inside its bucket. FAQ items and pages are ONE global
-- bucket each; carousels are bucketed by `placement` (a carousel's order is only meaningful
-- inside its own placement — see `Carousel.sortOrder` in schema.prisma), hence PARTITION BY.
--
-- ORDER: `sort_order, created_at, id`, NOT `created_at` alone. Today those are the same
-- thing (every `sort_order` is 0), so the current apparent order — which is exactly what the
-- lists render: `ORDER BY sort_order ASC, created_at ASC` — is preserved rather than
-- reshuffled. But they stop being the same thing the moment an operator drags a row, and
-- ordering by `created_at` alone would then DESTROY that hand-set order on a re-run. Leading
-- with `sort_order` makes this migration idempotent in effect: re-running it against an
-- already-numbered table computes the numbers it already has. `id` is the final tiebreaker
-- so the result is deterministic even for rows created in the same instant.
--
-- REPLAY: the `IS DISTINCT FROM` guard narrows a re-run to the rows whose number actually
-- changes, not to zero rows — read it as "order-preserving and safe to replay", not as "a
-- replay never writes". It IS zero rows only while a bucket is still contiguous from 0, and
-- nothing renumbers on DELETE: `FaqRepository.delete` and its siblings simply remove the row,
-- so deleting slot 1 leaves 0,2,3 and a replay compacts that back to 0,1,2 — two writes. The
-- compaction is harmless, and the property anyone reasoning about a restore-and-reapply
-- actually needs still holds: because the ranking leads with `sort_order`, closing the gap
-- cannot change the relative order of the surviving rows.
--
-- NOT a schema change: there is deliberately no UNIQUE constraint on (bucket, sort_order).
-- The reorder endpoint rewrites a bucket one row at a time inside a transaction, so
-- intermediate states legitimately hold duplicate pairs; a unique index would break every
-- reorder and force a two-phase negative-offset write (see
-- `src/common/reorder/sibling-order.util.ts`). Uniqueness is maintained by the writers —
-- this migration establishes it, `max + 1` on create preserves it, and the reorder endpoint
-- re-establishes it on every move.

-- FAQ items — one global list.
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (ORDER BY sort_order ASC, created_at ASC, id ASC))::int - 1 AS position
  FROM "faq_items"
)
UPDATE "faq_items" AS t
SET sort_order = ranked.position
FROM ranked
WHERE t.id = ranked.id
  AND t.sort_order IS DISTINCT FROM ranked.position;

-- Static pages — one global list (the `/legal` hub renders them in one sequence).
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (ORDER BY sort_order ASC, created_at ASC, id ASC))::int - 1 AS position
  FROM "pages"
)
UPDATE "pages" AS t
SET sort_order = ranked.position
FROM ranked
WHERE t.id = ranked.id
  AND t.sort_order IS DISTINCT FROM ranked.position;

-- Carousels — one list PER PLACEMENT (HOME_TABS / HOME_RAILS).
WITH ranked AS (
  SELECT id,
         (ROW_NUMBER() OVER (
            PARTITION BY placement
            ORDER BY sort_order ASC, created_at ASC, id ASC
          ))::int - 1 AS position
  FROM "carousels"
)
UPDATE "carousels" AS t
SET sort_order = ranked.position
FROM ranked
WHERE t.id = ranked.id
  AND t.sort_order IS DISTINCT FROM ranked.position;
