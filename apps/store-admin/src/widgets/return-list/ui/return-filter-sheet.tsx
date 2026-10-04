"use client";

import { returnStatusLabel } from "@/entities/return";
import {
  FilterSection,
  FilterSheet,
  PillGroup,
  useFilterDraft,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { RETURN_STATUS_OPTIONS } from "../model/return-views";

const d = dict.returns;

/** The register's filters as they sit in the URL — `""` means "any". */
export interface ReturnFilters {
  status: string;
}

const EMPTY: ReturnFilters = { status: "" };

interface ReturnFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: ReturnFilters;
  onApply: (next: ReturnFilters) => void;
}

/**
 * «Фільтри» of the returns register: the status select that used to sit in
 * the toolbar, as pills, writing the same `?status=`. The quick views above the
 * toolbar cover the same axis; the sheet keeps it where every other register
 * keeps its filters.
 *
 * Not drawn, because `GET /admin/returns` cannot filter by them yet (TASK-1056's
 * API tails): the period, the amount range, the customer.
 */
export function ReturnFilterSheet({
  open,
  onOpenChange,
  applied,
  onApply,
}: ReturnFilterSheetProps) {
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
            { value: "", label: d.allStatuses },
            ...RETURN_STATUS_OPTIONS.map((status) => ({
              value: status,
              label: returnStatusLabel(status),
            })),
          ]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
