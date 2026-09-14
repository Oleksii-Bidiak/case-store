"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerModerateMany,
} from "@/entities/review";
import { getAdminDashboardControllerGetNeedsActionQueryKey } from "@/entities/dashboard";
import { useAnnouncer } from "@/shared/ui";
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
}

/**
 * Bulk approve / reject the selected review texts (TASK-356).
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
 * loss — an operator who believes that will refuse to reject a text they should,
 * or reject a one-star review expecting the product's score to recover. It says
 * the two things that are actually at stake: the texts disappear from the site,
 * and the ratings do not.
 *
 * Approving does not ask at all — publishing a review is reversible by rejecting
 * it, and prompting on every safe action is how operators learn to dismiss
 * prompts unread.
 */
export function useReviewBulkModeration({
  onSuccess,
}: UseReviewBulkModerationOptions = {}): ReviewBulkModerationApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();
  const mutation = useAdminReviewControllerModerateMany();

  const moderate = useCallback(
    (ids: string[], action: ReviewBulkAction) => {
      if (mutation.isPending || ids.length === 0) return;

      if (action === "reject" && !window.confirm(t.rejectConfirm(ids.length))) {
        return;
      }

      announcePolite(t.announceSaving(ids.length));

      mutation.mutate(
        { data: { ids, action } },
        {
          onSuccess: (response) => {
            void queryClient.invalidateQueries({
              queryKey: getAdminReviewControllerListQueryKey(),
            });
            // TASK-248 contract: a bulk verdict moves the pending-reviews
            // counter exactly as a single one does, so the needs-action payload
            // (shared cache entry with the sidebar badge) has to go too. The
            // caller's `onSuccess` also invalidates it; this hook does not rely
            // on that, because a second caller that forgot would leave a stale
            // badge with nothing on screen looking wrong.
            void queryClient.invalidateQueries({
              queryKey: getAdminDashboardControllerGetNeedsActionQueryKey(),
            });
            const written = response.data.updatedCount;
            announcePolite(
              action === "reject"
                ? t.announceRejected(written)
                : t.announceApproved(written),
            );
            onSuccess?.();
          },
          onError: () => {
            announceAssertive(t.announceFailed);
          },
        },
      );
    },
    [announceAssertive, announcePolite, mutation, onSuccess, queryClient],
  );

  return { moderate, isPending: mutation.isPending };
}
