"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getAdminContactListQueryKey,
  getAdminContactUnreadCountQueryKey,
  useAdminContactUpdateStatusMany,
  type BulkContactMessageStatusDtoStatus,
} from "@/entities/contact";
import { useAnnouncer } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.messages.bulk;

export interface UseMessageBulkStatusOptions {
  /** Called after the server confirms the write — the caller clears its selection. */
  onSuccess?: () => void;
}

export interface MessageBulkStatusApi {
  setStatus: (ids: string[], status: BulkContactMessageStatusDtoStatus) => void;
  isPending: boolean;
}

/**
 * Bulk status change over the selected contact messages (TASK-354).
 *
 * ── Why this one does NOT confirm ────────────────────────────────────────────
 * Its siblings do: `useReviewBulkModeration` prompts because rejecting
 * hard-deletes, `useProductBulkStatus` prompts because deactivating pulls stock
 * off the storefront. Nothing here leaves the panel — every status is an
 * internal triage label, and the row's own dialog can set any of them back. A
 * prompt on a reversible action is how operators learn to dismiss prompts
 * unread, which is what makes the two that matter stop working.
 *
 * ── Both keys, not just the list ─────────────────────────────────────────────
 * The per-row path (`MessageDetailDialog`) invalidates the inbox list AND the
 * unread-count query behind the sidebar badge. This one must do the same: moving
 * fifteen NEW messages to READ and evicting only the list leaves a badge
 * advertising work that is already done, and the operator has no way to tell it
 * is lying. That divergence between a per-row and a bulk path is exactly what
 * TASK-293 had to go back and fix for categories.
 */
export function useMessageBulkStatus({
  onSuccess,
}: UseMessageBulkStatusOptions = {}): MessageBulkStatusApi {
  const queryClient = useQueryClient();
  const { announcePolite, announceAssertive } = useAnnouncer();
  const mutation = useAdminContactUpdateStatusMany();

  const setStatus = useCallback(
    (ids: string[], status: BulkContactMessageStatusDtoStatus) => {
      if (mutation.isPending || ids.length === 0) return;

      announcePolite(t.announceSaving(ids.length));

      mutation.mutate(
        { data: { ids, status } },
        {
          onSuccess: (response) => {
            void queryClient.invalidateQueries({
              queryKey: getAdminContactListQueryKey(),
            });
            void queryClient.invalidateQueries({
              queryKey: getAdminContactUnreadCountQueryKey(),
            });
            // Announce what the server wrote, not what was asked for. The two
            // can only differ when something went wrong, and that is precisely
            // when the real number matters.
            announcePolite(t.announceDone(response.data.updatedCount));
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

  return { setStatus, isPending: mutation.isPending };
}
