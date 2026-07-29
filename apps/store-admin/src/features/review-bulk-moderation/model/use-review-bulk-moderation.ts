"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminReviewControllerListQueryKey,
  useAdminReviewControllerModerateMany,
} from "@/entities/review";
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
 * Bulk approve / reject the selected reviews (TASK-356).
 *
 * ── Reject is a delete ───────────────────────────────────────────────────────
 * The per-row "Відхилити" button calls `DELETE /admin/reviews/:id`, which
 * hard-deletes the row so the author's unique `(userId, productId)` slot is
 * freed and they can submit again. The bulk form inherits that: there is no
 * archive, no tombstone, nothing to restore from the panel.
 *
 * So the confirmation names the count AND says the reviews are gone for good,
 * and cancelling issues ZERO requests. Approving does not ask — publishing a
 * review is reversible by rejecting it, and prompting on every safe action is
 * how operators learn to dismiss prompts unread.
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
