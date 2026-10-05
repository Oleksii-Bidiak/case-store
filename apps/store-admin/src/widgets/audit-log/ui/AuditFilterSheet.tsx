"use client";

import { useState } from "react";
import { useGetAuditLog } from "@/entities/audit";
import { ROLE_VALUES, roleLabel } from "@/entities/user";
import { countLabel } from "@/shared/lib";
import {
  DateRange,
  FilterSection,
  FilterSheet,
  Input,
  PillGroup,
  useFilterDraft,
  type PillOption,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  EMPTY_AUDIT_FILTERS,
  PERIOD_PRESETS,
  auditFiltersToQuery,
  kyivToday,
  periodRange,
  presetOf,
  type AuditFilters,
} from "../model/audit-filters";

const d = dict.auditLog;

interface AuditFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is applied now — the draft is reseeded from it on every open. */
  applied: AuditFilters;
  /** The committed action search: the count below must answer for it too. */
  action: string;
  /** «Мої дії» first, then every colleague by name (TASK-843). */
  actorOptions: readonly PillOption[];
  /** The entity types offered — the wire values with their labels. */
  entityOptions: readonly PillOption[];
  onApply: (next: AuditFilters) => void;
}

/**
 * «Фільтри» of the action log (AuditLogProposal Ж3): who, when, which level,
 * what was changed — the three selects that crowded the toolbar plus the
 * period the API always accepted (`from`/`to`) and nothing on screen offered.
 *
 * One person at a time and no «Власник» level: `GET /admin/audit-log` takes a
 * single `actorId` and an `actorRole` (the owner is an ADMIN with a flag) —
 * TASK-1068's API tails. The search over the people list is local: the
 * register is read once, whole (≤ 100 accounts).
 *
 * «Показати N записів» is the API's own count for the DRAFT — one `limit=1`
 * read while the sheet is open.
 */
export function AuditFilterSheet({
  open,
  onOpenChange,
  applied,
  action,
  actorOptions,
  entityOptions,
  onApply,
}: AuditFilterSheetProps) {
  const { draft, update, reset } = useFilterDraft(applied, open);
  const [actorTerm, setActorTerm] = useState("");
  const today = kyivToday();
  const preset = presetOf(draft.from, draft.to, today);

  const probe = useGetAuditLog(
    { ...auditFiltersToQuery(draft, action), page: 1, limit: 1 },
    { query: { enabled: open } },
  );
  const found = probe.data?.meta?.total;

  const term = actorTerm.trim().toLocaleLowerCase("uk");
  const people = term
    ? actorOptions.filter(
        (option) =>
          // «Мої дії» and the current pick stay put while searching.
          option.label === d.filterActorMine ||
          option.value === draft.actorId ||
          option.label.toLocaleLowerCase("uk").includes(term),
      )
    : actorOptions;

  return (
    <FilterSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setActorTerm("");
        onOpenChange(next);
      }}
      applyLabel={
        found === undefined || probe.isFetching
          ? d.filtersApply
          : d.filtersApplyCount(countLabel(found, d.itemForms))
      }
      onApply={() => {
        onApply(draft);
        setActorTerm("");
        onOpenChange(false);
      }}
      onReset={() => reset(EMPTY_AUDIT_FILTERS)}
    >
      <FilterSection title={d.filterActor}>
        <Input
          type="search"
          value={actorTerm}
          onChange={(event) => setActorTerm(event.target.value)}
          placeholder={d.filterActorSearch}
          aria-label={d.filterActorSearchAria}
        />
        <PillGroup
          label={d.filterActorAria}
          value={draft.actorId}
          onChange={(actorId) => update({ actorId })}
          options={[{ value: "", label: d.filterActorAll }, ...people]}
        />
        <p className="text-xs text-muted-foreground">{d.filterActorHint}</p>
      </FilterSection>

      <FilterSection title={d.filterPeriod}>
        <DateRange
          legend={d.filterPeriod}
          presets={PERIOD_PRESETS}
          preset={preset}
          onPresetChange={(next) => {
            const range = periodRange(next, today);
            // «Свій» keeps whatever is typed; it only says "custom".
            if (range) update({ from: range.from, to: range.to });
          }}
          from={draft.from}
          to={draft.to}
          onChange={({ from, to }) => update({ from, to })}
        />
      </FilterSection>

      <FilterSection title={d.filterLevel}>
        {/* CUSTOMER is not offered: the interceptor records only routes behind
            an admin permission, so it would be a guaranteed «Немає записів». */}
        <PillGroup
          label={d.filterRoleAria}
          value={draft.actorRole}
          onChange={(actorRole) => update({ actorRole })}
          options={[
            { value: "", label: d.filterRoleAll },
            { value: ROLE_VALUES.ADMIN, label: roleLabel(ROLE_VALUES.ADMIN) },
            {
              value: ROLE_VALUES.MANAGER,
              label: roleLabel(ROLE_VALUES.MANAGER),
            },
          ]}
        />
      </FilterSection>

      <FilterSection title={d.filterEntity}>
        <PillGroup
          label={d.filterEntityAria}
          value={draft.entityType}
          onChange={(entityType) => update({ entityType })}
          options={[{ value: "", label: d.filterEntityAll }, ...entityOptions]}
        />
      </FilterSection>
    </FilterSheet>
  );
}
