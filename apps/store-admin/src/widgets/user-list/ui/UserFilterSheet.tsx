"use client";

import {
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.users;

/** The list's filters as they sit in the URL — `""` means "any". */
export interface UserFilters {
  isActive: string;
}

const EMPTY: UserFilters = { isActive: "" };

interface UserFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: UserFilters;
  onApply: (next: UserFilters) => void;
}

/**
 * «Фільтри» of the customer list: the status select that used to sit in the
 * toolbar («Усі статуси»), as pills in the shared side sheet. The quick views
 * drive the same `?isActive=`; the sheet stays so the filter has the same home
 * it has on every other registry. Status is the only filter `GET /api/users`
 * accepts for customers.
 */
export function UserFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
}: UserFilterSheetProps) {
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
          value={draft.isActive}
          onChange={(isActive) => update({ isActive })}
          options={[
            { value: "", label: d.viewAll },
            { value: "true", label: d.viewActive },
            { value: "false", label: d.viewInactive },
          ]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
