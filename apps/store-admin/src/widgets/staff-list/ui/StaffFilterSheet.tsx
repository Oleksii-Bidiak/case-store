"use client";

import { ListStaffRole } from "@/entities/staff";
import {
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.staff;

/** The register's filters as they sit in the URL — `""` means "any". */
export interface StaffFilters {
  role: string;
  isActive: string;
}

const EMPTY: StaffFilters = { role: "", isActive: "" };

interface StaffFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: StaffFilters;
  onApply: (next: StaffFilters) => void;
}

/**
 * «Фільтри» of the register: the two selects that used to sit in the toolbar
 * («Усі рівні», «Усі статуси») as pills in the shared side sheet. Edits are a
 * draft until «Показати співробітників»; Esc or the overlay throw it away.
 *
 * «Адміністратор» includes the owner — they are an ADMIN who also holds the
 * flag — which is what an operator filtering for "who has full access" means.
 */
export function StaffFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
}: StaffFilterSheetProps) {
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
      <FilterSection title={d.filterLevel}>
        <PillGroup
          label={d.filterLevelAria}
          value={draft.role}
          onChange={(role) => update({ role })}
          options={[
            { value: "", label: d.filterAll },
            { value: ListStaffRole.ADMIN, label: d.levelAdmin },
            { value: ListStaffRole.MANAGER, label: d.levelManager },
          ]}
        />
      </FilterSection>
      <FilterSection title={d.filterStatus}>
        <PillGroup
          label={d.filterStatusAria}
          value={draft.isActive}
          onChange={(isActive) => update({ isActive })}
          options={[
            { value: "", label: d.filterAll },
            { value: "true", label: d.filterActive },
            { value: "false", label: d.filterInactive },
          ]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
