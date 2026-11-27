"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getProductControllerAdminFindAllQueryKey,
  skippedProductsMessage,
  useProductControllerSetStatusMany,
} from "@/entities/product";
import { toast } from "@/shared/ui/toast";
import {
  useProductControllerSetColorMany,
  useProductControllerSetGroupMany,
} from "@/shared/api";
import { UNDO_WINDOW_MS } from "@/shared/lib/list-reorder/use-reorder-lifecycle";
import { useAnnouncer } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  buildBulkUndoPlan,
  countPlanIds,
  withoutIds,
  type BulkUndoKind,
  type BulkUndoPlan,
  type BulkUndoRow,
  type BulkUndoValue,
} from "./bulk-undo-plan";

const t = dict.products.bulk;

export interface ProductBulkUndoApi {
  /**
   * Snapshot the rows' current values right before a bulk write. Call it on
   * every attempt — a cancelled or failed write simply never gets `commit`ted.
   */
  prepare: <K extends BulkUndoKind>(
    kind: K,
    ids: readonly string[],
    rows: readonly BulkUndoRow[],
    nextValue: BulkUndoValue<K>,
  ) => void;
  /**
   * The write succeeded: offer its undo for `UNDO_WINDOW_MS`. Returns how many
   * products the offer would put back — `null` when nothing changed, so the
   * caller shows no «Скасувати» toast either (wave 198). `skippedIds` are
   * products the write left untouched (a bulk show's unready ones, TASK-2573):
   * they never changed, so the undo leaves them out.
   */
  commit: (skippedIds?: readonly string[]) => number | null;
  undo: () => void;
  /**
   * An undo is on offer (inside the window, not yet used). It does NOT know
   * about the caller's forward bulk writes — the caller must also gate on them
   * (`canUndo && !forwardPending`): an undo replayed while a newer write is in
   * flight lands first, and that write then commits an offer that can never
   * reach the value before both.
   */
  canUndo: boolean;
  isPending: boolean;
}

/**
 * «Скасувати» for the product list's bulk actions — activate / deactivate,
 * move-to-group and set-colour (TASK-837, AD-PROD-33).
 *
 * ── How it undoes ────────────────────────────────────────────────────────────
 * There is no restore endpoint. The undo REPLAYS the same forward endpoints the
 * action used (`PATCH /products/status`, `/products/group`, `/products/color`),
 * once per distinct previous value, under the same `products:write` permission —
 * a reverse mutation, not a hidden back door. The snapshot is taken from the
 * rows on screen right before the write (`buildBulkUndoPlan`).
 *
 * ── What it does NOT promise (documented, not hidden) ────────────────────────
 * - **Not atomic.** Three previous groups are three requests. If the second one
 *   fails, the first stays reverted; the finished steps are dropped from the
 *   offer so pressing «Скасувати» again retries only what is left. An atomic
 *   bulk-restore endpoint is TASK-1310.
 * - **Colour undo is lossy.** The snapshot reads the colour AXIS in
 *   `attributes`; the endpoint writes both the axis and the «Колір» spec. So a
 *   product whose spec and axis disagreed comes back with both equal to the
 *   axis value; the axis key may come back under the group's preferred spelling
 *   (`Колір` vs `color`); a colour the write added to the SELECT's option list
 *   stays there; and a colour definition the write had to create on a root
 *   category is not removed.
 * - **Last action only, and only for a while.** A newer bulk action replaces the
 *   offer; after `UNDO_WINDOW_MS` (the reorder-undo window) it lapses — by then
 *   someone else may have edited the same products, and replaying a stale
 *   snapshot over their work would be a silent revert.
 */
interface UndoOffer {
  plan: BulkUndoPlan;
  expiresAt: number;
}

export function useProductBulkUndo(): ProductBulkUndoApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();
  const statusMutation = useProductControllerSetStatusMany();
  const groupMutation = useProductControllerSetGroupMany();
  const colorMutation = useProductControllerSetColorMany();

  const preparedRef = useRef<BulkUndoPlan | null>(null);
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const [isPending, setPending] = useState(false);

  // The offer lapses on its own. The deadline travels with the offer, so a
  // partial failure that trims the steps does not buy it a fresh window.
  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(
      () => setOffer(null),
      Math.max(0, offer.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [offer]);

  const prepare = useCallback(
    <K extends BulkUndoKind>(
      kind: K,
      ids: readonly string[],
      rows: readonly BulkUndoRow[],
      nextValue: BulkUndoValue<K>,
    ) => {
      preparedRef.current = buildBulkUndoPlan(kind, ids, rows, nextValue);
    },
    [],
  );

  const commit = useCallback(
    (skippedIds: readonly string[] = []) => {
      const plan = withoutIds(preparedRef.current, skippedIds);
      preparedRef.current = null;
      // `null` plan: nothing actually changed, so there is nothing to offer — and
      // an older offer is stale now either way.
      setOffer(plan ? { plan, expiresAt: Date.now() + UNDO_WINDOW_MS } : null);
      // Tell a screen-reader user the undo exists, naming the control by its
      // label (the reorder commit announcement does the same). The caller calls
      // `commit` last in its `onSuccess` — after `selection.clear()` — so this is
      // the message that stays in the polite region.
      if (!plan) return null;
      const count = countPlanIds(plan);
      announcePolite(t.announceUndoAvailable(count, t.undo));
      return count;
    },
    [announcePolite],
  );

  const runStep = useCallback(
    /** Resolves to how many of `ids` the server left as they were. */
    async (
      kind: BulkUndoKind,
      value: boolean | string | null,
      ids: string[],
    ): Promise<number> => {
      switch (kind) {
        case "status": {
          const response = await statusMutation.mutateAsync({
            data: { ids, isActive: value as boolean },
          });
          // Undoing a bulk HIDE re-shows through the same endpoint, which
          // leaves unready products hidden (TASK-2573) — say which.
          const skipped = response.data.skipped ?? [];
          if (skipped.length > 0) toast.error(skippedProductsMessage(skipped));
          return skipped.length;
        }
        case "group":
          await groupMutation.mutateAsync({
            data: { ids, groupId: value as string | null },
          });
          return 0;
        case "color":
          await colorMutation.mutateAsync({
            data: { ids, color: value as string | null },
          });
          return 0;
      }
    },
    [colorMutation, groupMutation, statusMutation],
  );

  const undo = useCallback(async () => {
    if (!offer || isPending) return;
    const { plan, expiresAt } = offer;
    setPending(true);
    const total = countPlanIds(plan);
    announcePolite(t.announceUndoing(total));

    const remaining = [...plan.steps];
    let skipped = 0;
    try {
      while (remaining.length > 0) {
        const step = remaining[0];
        skipped += await runStep(plan.kind, step.value, step.ids);
        remaining.shift();
      }
      setOffer(null);
      // Count what was actually undone: a re-show skips unready products.
      announcePolite(t.announceUndone(total - skipped));
    } catch {
      // Keep only what is still to do: a second press retries the rest
      // instead of replaying the steps that already landed.
      setOffer(
        remaining.length > 0 && Date.now() < expiresAt
          ? { plan: { ...plan, steps: remaining }, expiresAt }
          : null,
      );
      announceAssertive(t.announceUndoFailed);
    } finally {
      setPending(false);
      void queryClient.invalidateQueries({
        queryKey: getProductControllerAdminFindAllQueryKey(),
      });
    }
  }, [
    announceAssertive,
    announcePolite,
    isPending,
    offer,
    queryClient,
    runStep,
  ]);

  const undoSync = useCallback(() => {
    void undo();
  }, [undo]);

  return {
    prepare,
    commit,
    undo: undoSync,
    canUndo: offer !== null && !isPending,
    isPending,
  };
}
