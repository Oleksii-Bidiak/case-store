"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  toAuditEntry,
  useGetAuditLog,
  type AuditEntry,
} from "@/entities/audit";
import { formatOrderNumber } from "@/entities/order";
import { roleLabel } from "@/entities/user";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import {
  StaffLevelBadge,
  staffDisplayName,
  useListStaff,
  type StaffUserEntity,
} from "@/entities/staff";
import {
  Badge,
  CopyButton,
  DataRegistry,
  LiveAnnouncer,
  Skeleton,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type FilterChip,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { countLabel, formatDateTime, formatTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  EMPTY_AUDIT_FILTERS,
  auditFiltersToQuery,
  auditFiltersToUrl,
  dayGroup,
  periodLabel,
  readAuditFilters,
  type AuditFilters,
} from "../model/audit-filters";
import {
  auditChanges,
  auditChangesLine,
  auditSentence,
  auditSentenceText,
} from "../model/audit-sentence";
import { auditActionLabel } from "../model/action-label";
import { AuditFilterSheet } from "./AuditFilterSheet";

const d = dict.auditLog;

/**
 * The entity types the log can contain, in the order they are offered.
 *
 * DERIVED, not invented: `AuditInterceptor` writes
 * `entityTypeFromController(class.name)` on every mutating request that
 * carries an RBAC annotation — which is why the values look like `seoSettings`.
 * A hand-kept mirror of a server rule, so it can fall behind a new module: that
 * costs one missing pill and nothing else — a value typed into the URL still
 * filters, and its chip still names (raw) and clears it.
 */
const ENTITY_LABELS: Record<string, string | undefined> = d.entityLabels;
const ENTITY_OPTIONS = Object.entries(d.entityLabels).map(([value, label]) => ({
  value,
  label,
}));

/** Loading placeholder shaped like the registry underneath. */
export function AuditLogSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <Skeleton
        aria-hidden="true"
        className="h-10 w-full rounded-md md:max-w-150"
      />
      <div
        aria-hidden="true"
        className="flex flex-col gap-2 rounded-lg border p-4 shadow-card"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/* ── Who ────────────────────────────────────────────────────────────────── */

type StaffById = ReadonlyMap<string, StaffUserEntity>;

/**
 * The actor of an entry: a name from the staff register with their level badge
 * («Власник», not «Адміністратор», for the owner), else the email the log
 * kept. `actorEmail` and `actorRole` are denormalised onto the row on purpose
 * and `actorId` has no foreign key: the log must stay readable after an
 * account is deleted, and system actions have no user at all.
 */
function actorOf(
  entry: AuditEntry,
  staffById: StaffById,
): { name: string; badge: ReactNode } {
  if (!entry.actorEmail) {
    return { name: d.systemActor, badge: null };
  }
  const person = entry.actorId ? staffById.get(entry.actorId) : undefined;
  if (person) {
    return {
      name: staffDisplayName(person),
      badge: <StaffLevelBadge level={person.level} />,
    };
  }
  return {
    name:
      entry.actorId === null
        ? d.deletedActor(entry.actorEmail)
        : entry.actorEmail,
    badge: entry.actorRole ? (
      <Badge variant="secondary">{roleLabel(entry.actorRole)}</Badge>
    ) : null,
  };
}

function WhoCell({
  entry,
  staffById,
}: {
  entry: AuditEntry;
  staffById: StaffById;
}) {
  const actor = actorOf(entry, staffById);
  return (
    <span className="flex items-start gap-2">
      <span
        aria-hidden="true"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground"
      >
        {actor.name.charAt(0).toLocaleUpperCase("uk")}
      </span>
      <span className="flex min-w-0 flex-col items-start gap-1">
        <span className="break-words text-foreground">{actor.name}</span>
        {actor.badge}
      </span>
    </span>
  );
}

/* ── What ───────────────────────────────────────────────────────────────── */

function WhatCell({ entry }: { entry: AuditEntry }) {
  const sentence = auditSentence(entry);
  const line = auditChangesLine(auditChanges(entry));
  return (
    <span className="flex flex-col gap-0.5">
      <span className="break-words text-foreground">
        {sentence.raw ? (
          <code className="text-xs">{sentence.verb}</code>
        ) : (
          <span className="font-medium">{sentence.verb}</span>
        )}
        {sentence.object ? (
          <>
            {" "}
            {sentence.object.href ? (
              <Link
                href={sentence.object.href}
                className="rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {sentence.object.text}
              </Link>
            ) : (
              <span className="text-foreground">{sentence.object.text}</span>
            )}
          </>
        ) : null}
      </span>
      {line ? (
        <span className="text-xs break-words text-muted-foreground">
          {line}
        </span>
      ) : null}
    </span>
  );
}

/** «Поле · Було · Стало» and the collapsed technical details (Ж2). */
function EntryDetails({ entry }: { entry: AuditEntry }) {
  const changes = auditChanges(entry);
  return (
    <div className="flex flex-col gap-2 pt-1">
      {changes.length > 0 ? (
        <table
          aria-label={d.diffCaption}
          className="w-full max-w-160 overflow-hidden rounded-md border bg-card text-sm"
        >
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">{d.diffField}</th>
              <th className="px-3 py-1.5 font-medium">{d.diffFrom}</th>
              <th className="px-3 py-1.5 font-medium">{d.diffTo}</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change) => (
              <tr key={change.field} className="border-t align-top">
                <td className="px-3 py-1.5 text-foreground">{change.label}</td>
                <td className="px-3 py-1.5 break-words text-muted-foreground">
                  {change.from === null ? (
                    "—"
                  ) : (
                    <s className="decoration-muted-foreground">{change.from}</s>
                  )}
                </td>
                <td className="px-3 py-1.5 break-words text-foreground">
                  {change.to}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-muted-foreground">{d.diffEmpty}</p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded-xs outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
          {d.technicalDetails}
        </summary>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <code className="text-foreground">{entry.action}</code>
          {entry.summary ? (
            <span className="break-all">{entry.summary}</span>
          ) : null}
          {entry.entityId ? (
            <CopyButton
              value={entry.entityId}
              label={d.copyId}
              copiedLabel={d.copiedId}
              failedLabel={d.copyIdFailed}
              ariaLabel={d.copyIdAria(formatOrderNumber(entry.entityId))}
            />
          ) : null}
        </div>
      </details>
    </div>
  );
}

/* ── Columns ────────────────────────────────────────────────────────────── */

/**
 * Width the default-visible columns may share at 1440: content area 1136 minus
 * the trailing column (the expand toggle) and the box border — no checkbox.
 */
export const AUDIT_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/**
 * Columns (AuditLogProposal Ж1, Ж6). Sortable exactly where `AuditLogQueryDto`
 * sorts: `createdAt`, `actorEmail`, `action`. «Об'єкт» (type + full id) stays
 * one click away in «Колонки», unsorted — ordering by the type alone would
 * sort half of a cell.
 */
export function buildAuditColumns(
  grouped: boolean,
  staffById: StaffById,
): RegistryColumn<AuditEntry>[] {
  return [
    {
      id: "when",
      label: d.colWhen,
      sortField: "createdAt",
      defaultWidth: 104,
      minWidth: 72,
      className: "text-muted-foreground tabular-nums",
      // Inside a day group the day is the heading; only the time is new.
      cell: (entry) =>
        grouped ? formatTime(entry.createdAt) : formatDateTime(entry.createdAt),
    },
    {
      id: "who",
      label: d.colWho,
      sortField: "actorEmail",
      defaultWidth: 240,
      minWidth: 160,
      cell: (entry) => <WhoCell entry={entry} staffById={staffById} />,
    },
    {
      id: "what",
      label: d.colAction,
      sortField: "action",
      defaultWidth: 720,
      minWidth: 240,
      cell: (entry) => <WhatCell entry={entry} />,
    },
    {
      id: "object",
      label: d.colEntity,
      defaultVisible: false,
      defaultWidth: 240,
      cell: (entry) =>
        entry.entityType ? (
          <span className="flex flex-col text-muted-foreground">
            <span>{ENTITY_LABELS[entry.entityType] ?? entry.entityType}</span>
            {entry.entityId ? (
              <code className="text-xs break-all">{entry.entityId}</code>
            ) : null}
          </span>
        ) : (
          d.noEntity
        ),
    },
  ];
}

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  const asc = sortOrder === "asc";
  if (sortBy === "actorEmail") return asc ? d.sortActorAsc : d.sortActorDesc;
  if (sortBy === "action") return asc ? d.sortActionAsc : d.sortActionDesc;
  return asc ? d.sortCreatedAsc : d.sortCreatedDesc;
}

const getRowId = (entry: AuditEntry) => entry.id;

/**
 * The owner's action log (TASK-318) on the shared registry (wave 198,
 * TASK-1068, AuditLogProposal Ж1–Ж6).
 *
 * Owner-only on the API: the log denormalises staff emails and carries diffs of
 * customer-facing records. There is deliberately no delete or edit affordance —
 * the API has no such route: a log an actor can prune is not a log.
 *
 * ── What changed in wave 198, nothing removed ───────────────────────────────
 * An entry reads as a sentence — «Змінено статус замовлення #7C1E4B2A» — with
 * a link to the object where the panel has a page for it, and what changed in
 * words under it; a click opens «Поле · Було · Стало» and, collapsed, the
 * technical details (the raw action key, the request, «Скопіювати ID»). The
 * actor reads as a name with a level badge. Rows group by day while the log is
 * sorted by time. The three selects moved into «Фільтри» together with the
 * period the API always accepted; applied filters are chips.
 *
 * The state stays in the URL (TASK-356): `?action=` (the toolbar search — an
 * EXACT match on the server, so the raw key in the details is what to type),
 * `?actorId=`, `?actorRole=`, `?entityType=`, `?from=`/`?to=` (Kyiv days),
 * sort, page and size — a pasted link shows the colleague the same view.
 *
 * `OPERATIONAL_LIST_QUERY` (30 s instead of the panel-wide five minutes): the
 * log is read while something is going wrong, and the entry you wait for is
 * the one written seconds ago.
 *
 * ── The actor list (TASK-430, TASK-843) ─────────────────────────────────────
 * «Мої дії» writes the viewer's own uuid (never a server-resolved "mine", which
 * would show a recipient of a pasted link their own actions), then every staff
 * account from `GET /admin/staff`, deactivated ones included — they are exactly
 * whose past actions get audited. Asked only with `staff:read`, which every
 * holder of `audit:read` has; a deleted account or a foreign id still gets a
 * readable chip.
 *
 * Not drawn, because the API does not provide them (TASK-1068's API tails):
 * quick views by area (one `entityType` per request), several people at once,
 * the «Власник» level filter, a free-text search over names and objects, the
 * object's name in the sentence, human «Було» for most entries, an export.
 */
export function AuditLogView() {
  const searchParams = useSearchParams();
  const { userId, can } = useAuth();

  const canReadStaff = can(PERM.staffRead);
  const { data: staffData } = useListStaff(
    { limit: 100 },
    { query: { enabled: canReadStaff } },
  );
  const staffById = useMemo<StaffById>(
    () => new Map((staffData?.data ?? []).map((person) => [person.id, person])),
    [staffData],
  );
  const actorOptions = useMemo(
    () => [
      ...(userId ? [{ value: userId, label: d.filterActorMine }] : []),
      ...(staffData?.data ?? [])
        // The viewer is already «Мої дії».
        .filter((person) => person.id !== userId)
        .map((person) => ({
          value: person.id,
          label: staffDisplayName(person),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "uk")),
    ],
    [staffData, userId],
  );

  const action = searchParams.get("action") ?? "";
  const filters = readAuditFilters(searchParams);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const { data, dataUpdatedAt, isLoading, isFetching, isError, refetch } =
    useGetAuditLog(
      {
        ...auditFiltersToQuery(filters, action),
        page,
        limit: pageSize,
        sortBy,
        sortOrder,
      },
      { query: OPERATIONAL_LIST_QUERY },
    );

  const entries = useMemo(() => (data?.data ?? []).map(toAuditEntry), [data]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  // Day headings only make sense while the rows run in time order.
  const grouped = sortBy === "createdAt";
  const columns = useMemo(
    () => buildAuditColumns(grouped, staffById),
    [grouped, staffById],
  );
  const registry = useDataRegistry({
    tableId: "audit-log",
    columns,
    rows: entries,
    getRowId,
  });

  const actorName = (id: string) =>
    id === userId
      ? d.filterActorMine
      : staffById.get(id)
        ? staffDisplayName(staffById.get(id) as StaffUserEntity)
        : d.filterActorOther(id);

  const chips: FilterChip[] = [];
  const clear = (patch: Partial<Record<keyof AuditFilters, undefined>>) =>
    updateParams({ ...patch, page: undefined });
  if (filters.actorId) {
    chips.push({
      key: "actorId",
      label: d.chipActor(actorName(filters.actorId)),
      onRemove: () => clear({ actorId: undefined }),
    });
  }
  if (filters.from || filters.to) {
    chips.push({
      key: "period",
      label: d.chipPeriod(periodLabel(filters.from, filters.to)),
      onRemove: () => clear({ from: undefined, to: undefined }),
    });
  }
  if (filters.actorRole) {
    chips.push({
      key: "actorRole",
      label: d.chipLevel(roleLabel(filters.actorRole)),
      onRemove: () => clear({ actorRole: undefined }),
    });
  }
  if (filters.entityType) {
    chips.push({
      key: "entityType",
      // An entity type this list has not caught up with yet is named raw —
      // the raw value IS what the URL says and what the rows were narrowed by.
      label: d.chipEntity(
        ENTITY_LABELS[filters.entityType] ?? filters.entityType,
      ),
      onRemove: () => clear({ entityType: undefined }),
    });
  }

  // Applied in «Фільтри» — the badge on the button counts these.
  const sheetFilterCount = chips.length;
  // The search is an EXACT action filter on the server, which a box with a
  // code in it does not make obvious — so it gets a chip in words too.
  if (action) {
    chips.push({
      key: "action",
      label: d.chipAction(auditActionLabel(action) ?? action),
      onRemove: () => updateParams({ action: undefined, page: undefined }),
    });
  }

  const isFiltered = chips.length > 0;

  const renderCard = (entry: AuditEntry, parts: RegistryCardParts) => {
    const actor = actorOf(entry, staffById);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-xs text-muted-foreground tabular-nums">
            {grouped
              ? formatTime(entry.createdAt)
              : formatDateTime(entry.createdAt)}{" "}
            · {actor.name}
          </span>
          {actor.badge}
        </div>
        <div className="flex items-start justify-between gap-2">
          <WhatCell entry={entry} />
          {parts.expand}
        </div>
      </div>
    );
  };

  return (
    <LiveAnnouncer>
      <DataRegistry
        registry={registry}
        title={d.heading}
        showHeader={false}
        search={{
          // Bound to `action`, not `search`: that IS the filter the API offers.
          param: "action",
          value: action,
          placeholder: d.filterActionPlaceholder,
          label: d.filterActionAria,
        }}
        filters={{
          count: sheetFilterCount,
          renderSheet: ({ open, onOpenChange }) => (
            <AuditFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={filters}
              action={action}
              actorOptions={actorOptions}
              entityOptions={ENTITY_OPTIONS}
              onApply={(next) =>
                updateParams({ ...auditFiltersToUrl(next), page: undefined })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        chips={chips}
        onClearAllChips={() =>
          updateParams({
            ...auditFiltersToUrl(EMPTY_AUDIT_FILTERS),
            action: undefined,
            page: undefined,
          })
        }
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          ) : null
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        updatedAt={data ? dataUpdatedAt : undefined}
        itemForms={d.itemForms}
        getRowLabel={(entry) =>
          `${auditSentenceText(entry)}, ${formatDateTime(entry.createdAt)}`
        }
        sort={{ sortBy, sortOrder, onSort }}
        groupBy={
          grouped
            ? (entry) => dayGroup(entry.createdAt, dataUpdatedAt)
            : undefined
        }
        renderExpanded={(entry) => <EntryDetails entry={entry} />}
        renderCard={renderCard}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={isFiltered ? d.emptyFiltered : d.empty}
        pagination={{ page, totalPages, pageSize }}
      />
    </LiveAnnouncer>
  );
}
