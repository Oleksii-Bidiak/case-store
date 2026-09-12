"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  toAuditEntry,
  useGetAuditLog,
  type AuditEntry,
} from "@/entities/audit";
import { roleLabel } from "@/entities/user";
import {
  Badge,
  Button,
  LiveAnnouncer,
  Skeleton,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableFilters,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableToolbar,
  pageSizeFrom,
  type TableFilterDef,
} from "@/shared/ui";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";

const d = dict.auditLog;

/**
 * The entity types the log can contain, in the order they are offered.
 *
 * They are DERIVED, not invented: `AuditInterceptor` writes
 * `entityTypeFromController(class.name)` — the controller's class name with
 * `Controller` and a leading `Admin` stripped, first letter lowercased — on
 * every mutating request that carries an RBAC annotation. This list is that
 * derivation applied to the annotated controllers, which is why the values look
 * like `seoSettings` and not like `SEO settings`.
 *
 * It is a hand-kept mirror of a server-side rule, so it can fall behind a newly
 * added module. That costs one missing OPTION and nothing else: a value typed
 * into the URL still filters, and `TableFilters` still shows (and clears) its
 * chip — the guarantee is that everything offered here exists, not that
 * everything that exists is offered.
 */
const ENTITY_TYPES = Object.keys(
  d.entityLabels,
) as (keyof typeof d.entityLabels)[];

/** Loading placeholder shaped like the table underneath. */
export function AuditLogSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full rounded-md" />
      ))}
    </div>
  );
}

/**
 * Render the actor of a log entry.
 *
 * `actorEmail` and `actorRole` are denormalised onto the row ON PURPOSE, and
 * `actorId` carries no foreign key: the log has to stay readable after the
 * account is deleted, and system actions (payment callbacks, cron) have no user
 * at all. So this shows the email, never a raw id — an audit trail of UUIDs is
 * an audit trail nobody reads.
 */
function actorText(entry: AuditEntry): string {
  if (!entry.actorEmail) {
    return d.systemActor;
  }
  return entry.actorId === null
    ? d.deletedActor(entry.actorEmail)
    : entry.actorEmail;
}

function DiffCell({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);

  const diff = entry.diff;
  const fields = diff ? Object.keys(diff) : [];

  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="mt-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {d.diffToggle}
      </Button>
      {open && (
        <dl className="mt-1 flex flex-col gap-1 rounded-md border border-border p-2">
          {fields.map((field) => (
            <div key={field} className="flex flex-col gap-0.5">
              <dt className="font-mono text-xs text-muted-foreground">
                {field}
              </dt>
              <dd className="break-all font-mono text-xs text-foreground">
                {d.diffFrom}: {JSON.stringify(diff?.[field]?.from ?? null)}
                {" → "}
                {d.diffTo}: {JSON.stringify(diff?.[field]?.to ?? null)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * The owner's action log (TASK-318).
 *
 * Owner-only on the API: the log denormalises staff emails and carries diffs of
 * customer-facing records, so it is both a PII surface and the record of what
 * staff did — a manager who could read it could check whether their own actions
 * had been noticed. There is deliberately no delete or edit affordance here,
 * because the API has no such route: a log an actor can prune is not a log.
 *
 * ── Why the state moved into the URL (TASK-356) ─────────────────────────────
 * Filters, page and sort used to be `useState`, which made this the one admin
 * table whose view could not be reloaded or pasted to anyone. That is backwards
 * for the screen you open precisely when you need to show a colleague what
 * happened: "sorted by actor, filtered to order.refund, page 3" is the whole
 * message. Everything is now in the query string, exactly like the user and
 * subscriber tables next door.
 *
 * ── Why this one list overrides `staleTime` ────────────────────────────────
 * `OPERATIONAL_LIST_QUERY` (30 s instead of the panel-wide five minutes). The
 * log is read while something is going wrong — an order changed hands, a
 * refund fired twice — and the entry you are waiting for is by definition the
 * one written seconds ago. A five-minute-old view of an append-only log looks
 * exactly like "it never happened".
 *
 * ── Why the entity filter became a Select (TASK-423) ───────────────────────
 * Both filters used to be free-text boxes, and the repository matches them
 * EXACTLY (`where.entityType = entityType`, no `contains`). A free-text box over
 * an exact match is a trap: every near miss answers «Немає записів» — the same
 * thing an empty log says — and the placeholder here actively baited it, since
 * it suggested «Product» while the interceptor writes `product`. The entity axis
 * is a closed set, so it is now offered rather than typed, and cannot be
 * mistyped.
 *
 * `action` stays a text field because it is NOT a closed set — it is
 * `entityType.handlerName`, one per guarded mutating route, and a list of
 * ninety-odd of them derived by hand in the frontend would be both unusable and
 * wrong within a release. It is the shared search box bound to the `action`
 * param rather than a `?search=` the API does not have.
 *
 * There is deliberately no page-size cap trick here: the DTO allows `limit` up
 * to 200, but the shared control offers 20 / 50 / 100 like every other table, so
 * "page 3" means the same thing on this screen as on the others. It used to
 * default to 50 with no control at all.
 */
export function AuditLogView() {
  const searchParams = useSearchParams();

  const action = searchParams.get("action") ?? "";
  const entityType = searchParams.get("entityType") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();

  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const { data, isLoading, isFetching, isError, refetch } = useGetAuditLog(
    {
      page,
      limit: pageSize,
      action: action || undefined,
      entityType: entityType || undefined,
      sortBy,
      sortOrder,
    },
    { query: OPERATIONAL_LIST_QUERY },
  );

  const entries = (data?.data ?? []).map(toAuditEntry);
  const totalPages = data?.meta?.totalPages ?? 1;
  const isFiltered = action !== "" || entityType !== "";

  const filters: TableFilterDef[] = [
    {
      param: "entityType",
      label: d.filterEntityAria,
      allLabel: d.filterEntityAll,
      options: ENTITY_TYPES.map((value) => ({
        value,
        label: d.entityLabels[value],
      })),
      // No `resolveLabel`: an entity type this list has not caught up with yet
      // is shown raw by `TableFilters`, which is the right answer — the raw value
      // IS what the URL says and what the rows were narrowed by, and the chip
      // still clears it.
      className: "w-56",
    },
  ];

  return (
    <LiveAnnouncer>
      <div className="flex flex-col gap-4">
        <TableToolbar
          className="mb-0"
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
          search={
            // Bound to `action`, not to a `search` param: that IS the filter the
            // API offers, and inventing a free-text one here would send a param
            // the DTO drops on the floor.
            <TableSearch
              param="action"
              value={action}
              placeholder={d.filterActionPlaceholder}
              label={d.filterActionAria}
            />
          }
          filters={<TableFilters filters={filters} values={{ entityType }} />}
        />

        {isLoading ? (
          <AuditLogSkeleton />
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {d.loadError}
          </p>
        ) : entries.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
            {isFiltered ? d.emptyFiltered : d.empty}
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-border shadow-card">
            {isFetching && !isLoading && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
              >
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableColumnHeader
                    field="createdAt"
                    label={d.colWhen}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <SortableColumnHeader
                    field="actorEmail"
                    label={d.colWho}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <SortableColumnHeader
                    field="action"
                    label={d.colAction}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  {/* No sort on the entity column: the cell is a type/id pair,
                      and ordering by the type alone would look like it sorted
                      the column when it sorted half of it. The entityType
                      filter above answers that question properly. */}
                  <TableHead>{d.colEntity}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(entry.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-foreground">
                          {actorText(entry)}
                        </span>
                        {entry.actorRole && (
                          <Badge variant="secondary" className="w-fit">
                            {roleLabel(entry.actorRole)}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{entry.action}</code>
                      {entry.summary && (
                        <p className="text-sm text-muted-foreground">
                          {entry.summary}
                        </p>
                      )}
                      <DiffCell entry={entry} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.entityType ? (
                        <span className="flex flex-col">
                          <span>{entry.entityType}</span>
                          {entry.entityId && (
                            <code className="break-all text-xs">
                              {entry.entityId}
                            </code>
                          )}
                        </span>
                      ) : (
                        d.noEntity
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !isError && entries.length > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
          />
        )}
      </div>
    </LiveAnnouncer>
  );
}
