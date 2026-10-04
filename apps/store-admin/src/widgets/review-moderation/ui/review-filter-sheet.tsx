"use client";

import {
  AdminReviewControllerListStatus,
  ReviewAuthorVisibility,
} from "@/entities/review";
import {
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.reviews;

/** The two URL params the old selects wrote — `""` is the API default. */
export interface ReviewFilters {
  status: string;
  visibility: string;
}

const EMPTY: ReviewFilters = { status: "", visibility: "" };

export const STATUS_LABELS: Record<string, string> = {
  [AdminReviewControllerListStatus.pending]: d.filterPending,
  [AdminReviewControllerListStatus.approved]: d.filterApproved,
  [AdminReviewControllerListStatus.rejected]: d.filterRejected,
  [AdminReviewControllerListStatus.all]: d.filterAll,
};

export const VISIBILITY_LABELS: Record<string, string> = {
  [ReviewAuthorVisibility.visible]: d.filterVisibilityVisible,
  [ReviewAuthorVisibility.hidden]: d.filterVisibilityHidden,
  [ReviewAuthorVisibility.all]: d.filterVisibilityAll,
};

interface ReviewFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: ReviewFilters;
  onApply: (next: ReviewFilters) => void;
}

/**
 * «Фільтри» of the moderation queue (wave 198, TASK-1057). The quick views
 * replaced the status and author-visibility selects for the common cases; the
 * sheet keeps every combination the two selects could make — «опубліковані
 * тексти прихованих авторів» is no view, and it must stay reachable.
 *
 * The «no filter» pill of each group is the API default it really means
 * («На розгляді», «Лише видимі»), never an «Усі» that would silently serve the
 * pending queue.
 */
export function ReviewFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
}: ReviewFilterSheetProps) {
  const { draft, update, reset } = useFilterDraft(applied, open);

  return (
    <FilterSheet
      open={open}
      onOpenChange={onOpenChange}
      applyLabel={d.filtersApply}
      onApply={() => {
        onApply(draft);
        onOpenChange(false);
      }}
      onReset={() => reset(EMPTY)}
    >
      <FilterSection title={d.filterStatusTitle}>
        <PillGroup
          label={d.filterStatusAria}
          value={draft.status}
          onChange={(status) => update({ status })}
          options={[
            { value: "", label: d.filterPending },
            {
              value: AdminReviewControllerListStatus.approved,
              label: d.filterApproved,
            },
            {
              value: AdminReviewControllerListStatus.rejected,
              label: d.filterRejected,
            },
            { value: AdminReviewControllerListStatus.all, label: d.filterAll },
          ]}
        />
      </FilterSection>
      <FilterSection title={d.filterAuthorsTitle}>
        <PillGroup
          label={d.filterVisibilityAria}
          value={draft.visibility}
          onChange={(visibility) => update({ visibility })}
          options={[
            { value: "", label: d.filterVisibilityVisible },
            {
              value: ReviewAuthorVisibility.hidden,
              label: d.filterVisibilityHidden,
            },
            {
              value: ReviewAuthorVisibility.all,
              label: d.filterVisibilityAll,
            },
          ]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
