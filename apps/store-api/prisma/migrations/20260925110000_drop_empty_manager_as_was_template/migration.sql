-- ─────────────────────────────────────────────────────────────────────────────
-- Remove «Менеджер (як було)» where it came out EMPTY (TASK-635, plan 192).
--
-- `20260914140000_access_model` creates the template unconditionally and then
-- copies into it whatever `role_permissions` granted MANAGER. Where the matrix
-- was never filled — every fresh install, and every database measured so far —
-- that copy is nothing, and the shop is left with an empty template whose name
-- promises "what a manager used to have". Applying a template REPLACES a
-- person's set, so applying this one strips a person of every permission; the
-- only guard against that was a counter in the UI.
--
-- A migration that has been applied cannot be edited, so the creation stays and
-- this removes the result — only where there is nothing in it. A shop whose
-- matrix DID hold manager grants keeps its template with them; so does one where
-- a later backfill (customers:card, returns, media) or the owner added items, or
-- where the owner re-used the name for a set of their own: any item at all keeps
-- it. On a fresh install the net effect is that the template never exists.
--
-- Measured before deploy (2026-09-25): store_dev — 1 template with this name,
-- 0 items → 1 row to delete; store_test — the same, 1 → 1. After: 0 and 0.
--
-- Idempotent: a second run finds nothing to delete.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM "permission_templates" AS template
WHERE template."name" = 'Менеджер (як було)'
  AND NOT EXISTS (
    SELECT 1
    FROM "permission_template_items" AS item
    WHERE item."template_id" = template."id"
  );
