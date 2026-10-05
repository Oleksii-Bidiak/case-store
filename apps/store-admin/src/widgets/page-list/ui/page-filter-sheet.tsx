"use client";

import {
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.pages;

/** The list's filters as they sit in the URL — `""` means "any". */
export interface PageFilters {
  status: string;
}

const EMPTY: PageFilters = { status: "" };

interface PageFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: PageFilters;
  onApply: (next: PageFilters) => void;
}

/**
 * «Фільтри» of the page list (TASK-1043): the status select that used to sit
 * in the toolbar (TASK-562) as pills in the shared side sheet. The filter is
 * still LOCAL — it hides rows of the complete list and locks the drag; it
 * never narrows the API query (see `admin-page-table.tsx`).
 */
export function PageFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
}: PageFilterSheetProps) {
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
          label={d.filterStatusTitle}
          value={draft.status}
          onChange={(status) => update({ status })}
          options={[
            { value: "", label: d.filterAll },
            { value: "PUBLISHED", label: d.statusPublished },
            { value: "SCHEDULED", label: d.statusScheduled },
            { value: "DRAFT", label: d.statusDraft },
          ]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
