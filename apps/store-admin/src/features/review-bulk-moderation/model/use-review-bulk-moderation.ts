"use client";

import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerModerateMany,
} from "@/entities/review";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { useBulkStatus } from "@/features/bulk-status";
import { countLabel } from "@/shared/lib";
import { dict } from "@/shared/config";

const t = dict.reviews.bulk;

export type ReviewBulkAction = "approve" | "reject";

export interface UseReviewBulkModerationOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface ReviewBulkModerationApi {
  moderate: (ids: string[], action: ReviewBulkAction) => void;
  isPending: boolean;
  /** The reject prompt (TASK-812) — render once in the caller's JSX. */
  confirmDialog: ReactNode;
}

/**
 * Bulk approve / reject the selected review texts (TASK-356), on top of the
 * shared `useBulkStatus` engine (TASK-812) — the prompt is an AlertDialog now,
 * not `window.confirm`.
 *
 * ── Reject is NOT a delete any more (TASK-446) ───────────────────────────────
 * It used to be. The per-row button called `DELETE /admin/reviews/:id`, which
 * hard-deleted the row: the rating left the product's average with it, the
 * author's unique `(userId, productId)` slot was freed so they could submit a
 * fresh review, and nothing in the panel could restore any of it.
 *
 * None of that is true now. `PATCH …/:id/reject` stamps `textStatus = REJECTED`
 * and stops there — the row survives, the RATING GOES ON COUNTING toward the
 * product's score, the slot is not freed, and the author edits their own text
 * from the storefront instead of re-submitting. A moderator can reopen the
 * «Відхилені» queue and approve the same row later.
 *
 * The prompt therefore stayed, but stopped lying. It still asks, because the
 * texts do leave the site and the count is worth seeing first, and cancelling
 * still issues ZERO requests. What it no longer does is warn about a permanent
 * loss. It says the two things that are actually at stake: the texts disappear
 * from the site, and the ratings do not.
 *
 * ── Approving asks too, since wave 198 (TASK-1057) ───────────────────────────
 * It used to go out on the click, on the grounds that publishing is reversible.
 * The owner's artboard (ReviewsProposal В6) asks: a bulk approve puts N texts
 * on product pages and N ratings into the score in one go, which is not a safe
 * action at the scale a selection makes it. The prompt says exactly that, and
 * how to undo it — not a generic «are you sure».
 */
export function useReviewBulkModeration({
  onSuccess,
}: UseReviewBulkModerationOptions = {}): ReviewBulkModerationApi {
  const queryClient = useQueryClient();
  const mutation = useAdminReviewControllerModerateMany();

  const { run, isPending, confirmDialog } = useBulkStatus({
    mutation,
    toVariables: (ids, action: ReviewBulkAction) => ({ data: { ids, action } }),
    // Both directions ask since wave 198 (TASK-1057, ReviewsProposal В6) — see
    // the header note.
    confirmFor: (ids, action) =>
      action === "reject"
        ? {
            title: t.rejectConfirmTitle(
              countLabel(ids.length, t.genitiveForms),
            ),
            description: t.rejectConfirm(ids.length),
            confirmLabel: dict.reviews.reject,
            destructive: true,
          }
        : {
            title: t.approveConfirmTitle(
              countLabel(ids.length, dict.reviews.itemForms),
            ),
            description: t.approveConfirm,
            confirmLabel: t.approveConfirmLabel(ids.length),
          },
    announceSaving: (count) => t.announceSaving(count),
    announceDone: (response, _ids, action) =>
      action === "reject"
        ? t.announceRejected(response.data.updatedCount)
        : t.announceApproved(response.data.updatedCount),
    announceFailed: t.announceFailed,
    onWritten: () => {
      void queryClient.invalidateQueries({
        queryKey: getAdminReviewControllerListQueryKey(),
      });
      // TASK-248 contract: a bulk verdict moves the pending-reviews counter
      // exactly as a single one does, so the needs-action payload (shared cache
      // entry with the sidebar badge) has to go too. The caller's `onSuccess`
      // also invalidates it; this hook does not rely on that, because a second
      // caller that forgot would leave a stale badge.
      void queryClient.invalidateQueries({
        queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
      });
    },
    onSuccess,
  });

  return { moderate: run, isPending, confirmDialog };
}
