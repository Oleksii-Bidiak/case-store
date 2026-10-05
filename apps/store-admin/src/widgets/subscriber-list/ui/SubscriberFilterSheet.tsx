"use client";

import { AdminNewsletterControllerFindAllStatus } from "@/entities/newsletter";
import {
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.subscribers;

/** The list's filters as they sit in the URL — `""` means "any". */
export interface SubscriberFilters {
  status: string;
}

const EMPTY: SubscriberFilters = { status: "" };

interface SubscriberFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applied: SubscriberFilters;
  onApply: (next: SubscriberFilters) => void;
}

/**
 * «Фільтри» of the subscriber list: the status select that used to sit in the
 * toolbar, as pills in the shared side sheet. Status is the only filter
 * `GET /api/newsletter/admin` accepts; the segments of the artboard (buyers,
 * unconfirmed…) wait for the API (TASK-1063 tail).
 */
export function SubscriberFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
}: SubscriberFilterSheetProps) {
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
      <FilterSection title={d.filterStatus}>
        <PillGroup
          label={d.filterStatusAria}
          value={draft.status}
          onChange={(status) => update({ status })}
          options={[
            { value: "", label: d.viewAll },
            {
              value: AdminNewsletterControllerFindAllStatus.SUBSCRIBED,
              label: d.viewSubscribed,
            },
            {
              value: AdminNewsletterControllerFindAllStatus.UNSUBSCRIBED,
              label: d.viewUnsubscribed,
            },
          ]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
