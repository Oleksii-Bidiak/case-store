"use client";

import { useCallback, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import {
  getGetCategoryReportQueryKey,
  useGetBrandReport,
  useGetCategoryReport,
  type BrandReportEntity,
  type CategoryReportEntity,
  type CategoryReportEnvelope,
  type CategoryReportRowEntity,
  type ComparedValueEntity,
} from "@/entities/analytics";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib/format";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { cn } from "@/shared/lib/utils";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { brandsCsv, categoriesCsv, categoryLabel } from "../lib/csv";
import { formatCount } from "../lib/format";
import type { ReportQuery } from "../model/report-period";
import { CsvButton } from "./CsvButton";
import { ReportCard } from "./ReportCard";
import { ReportBodySkeleton, ReportLoadError } from "./report-parts";

const d = dict.analytics;

type CatalogueView = "categories" | "brands";

/** The URL value of the brands tab; categories is the default, left out. */
const BRANDS_VIEW = "brands";

/** Left padding per depth of the category tree (root, child, grandchild…). */
const DEPTH_PADDING = ["pl-2.5", "pl-8", "pl-14", "pl-20", "pl-26"] as const;

// 13 px is the scale's `text-pill` step (globals.css) — the `.ct th` size.
const HEAD = "h-9 px-2.5 text-pill font-medium text-muted-foreground";
const CELL = "px-2.5 py-2 tabular-nums";

/**
 * «Категорії й бренди» (TASK-692, ДН-8.1/8.4). Units, orders and — with
 * `analytics:revenue` — gross revenue per root category, a root opening into
 * its children on demand (each child summed over its own subtree), or per
 * brand on the second tab. Counted by today's catalogue, which the subtitle
 * says, because a moved product is counted where it is now.
 *
 * No per-row change: the API compares the period as a whole, not each row
 * (owner's decision; a backlog row).
 */
export function CatalogueReport({ query }: { query: ReportQuery }) {
  const searchParams = useSearchParams();
  const setUrlParams = useUrlParams();
  const view: CatalogueView =
    searchParams.get("view") === BRANDS_VIEW ? "brands" : "categories";

  // Only the visible tab asks the API.
  const categories = useGetCategoryReport(query, {
    query: { enabled: view === "categories" },
  });
  const brands = useGetBrandReport(query, {
    query: { enabled: view === "brands" },
  });
  const basis =
    view === "categories"
      ? categories.data?.data.basis
      : brands.data?.data.basis;
  const categoriesRevenue = useShowRevenue(categories.data?.data.rows);
  const brandsRevenue = useShowRevenue(brands.data?.data.rows);

  // Which categories are open — local, not in the URL, and closed again when
  // the period changes (forms.md 1a: a render-time reset, no remount). Held
  // here, above the table, because the CSV exports exactly the open rows.
  const periodKey = JSON.stringify(query);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [expandedFor, setExpandedFor] = useState(periodKey);
  if (expandedFor !== periodKey) {
    setExpandedFor(periodKey);
    setExpanded(new Set());
  }
  const toggle = useCallback((categoryId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }, []);

  // The CSV of the visible tab, built from the same data the table draws —
  // the open children read from the very cache entries their rows render.
  const queryClient = useQueryClient();
  const categoriesData = categories.data?.data;
  const brandsData = brands.data?.data;
  const build =
    view === "categories"
      ? categoriesData && !categories.isError
        ? () =>
            categoriesCsv({
              period: categoriesData.period,
              rows: categoriesData.rows,
              showRevenue: categoriesRevenue,
              expanded,
              childrenOf: (categoryId) =>
                queryClient.getQueryData<CategoryReportEnvelope>(
                  getGetCategoryReportQueryKey({
                    ...query,
                    parentId: categoryId,
                  }),
                )?.data.rows,
            })
        : null
      : brandsData && !brands.isError
        ? () => brandsCsv(brandsData, brandsRevenue)
        : null;

  return (
    <Tabs
      value={view}
      onValueChange={(next) =>
        setUrlParams({ view: next === BRANDS_VIEW ? BRANDS_VIEW : undefined })
      }
      className="contents"
    >
      <ReportCard
        title={d.catalogueTitle}
        subtitle={basis === "current-catalogue" ? d.catalogueBasis : undefined}
        actions={
          <>
            <TabsList aria-label={d.catalogueTitle}>
              <TabsTrigger value="categories">{d.tabCategories}</TabsTrigger>
              <TabsTrigger value="brands">{d.tabBrands}</TabsTrigger>
            </TabsList>
            <CsvButton title={d.catalogueTitle} build={build} />
          </>
        }
      >
        <TabsContent value="categories">
          <CategoryTable
            report={categories}
            query={query}
            showRevenue={categoriesRevenue}
            expanded={expanded}
            toggle={toggle}
          />
        </TabsContent>
        <TabsContent value="brands">
          <BrandTable report={brands} showRevenue={brandsRevenue} />
        </TabsContent>
      </ReportCard>
    </Tabs>
  );
}

/* ── Shared row pieces ─────────────────────────────────────────────────── */

interface Figures {
  units: ComparedValueEntity;
  orders: ComparedValueEntity;
  revenue?: ComparedValueEntity;
}

/** Whether the rows carry money — the API omits the key without the right. */
function useShowRevenue(rows: readonly Figures[] | undefined): boolean {
  const { can } = useAuth();
  // An empty list says nothing about the money; fall back to the right.
  return rows && rows.length
    ? rows.some((row) => row.revenue !== undefined)
    : can(PERM.analyticsRevenue);
}

function maxRevenueOf(rows: readonly Figures[]): number {
  return Math.max(0, ...rows.map((row) => row.revenue?.current ?? 0));
}

function FigureCells({
  row,
  showRevenue,
  maxRevenue,
}: {
  row: Figures;
  showRevenue: boolean;
  maxRevenue: number;
}) {
  const revenue = row.revenue?.current ?? 0;
  const share = maxRevenue > 0 ? Math.max(0, revenue / maxRevenue) * 100 : 0;
  return (
    <>
      <TableCell className={cn(CELL, "text-right")}>
        {formatCount(row.units.current)}
      </TableCell>
      <TableCell className={cn(CELL, "text-right")}>
        {formatCount(row.orders.current)}
      </TableCell>
      {showRevenue ? (
        <TableCell className={cn(CELL, "text-right")}>
          <span className="flex items-center justify-end gap-2">
            {/* The share of the biggest row — a glance, not a figure. */}
            <span
              aria-hidden="true"
              className="hidden w-28 justify-end md:flex"
            >
              <span
                className="h-2 rounded-full bg-primary/70"
                style={{ width: `${share}%` }}
              />
            </span>
            <span className="min-w-24">{formatCurrency(revenue)}</span>
          </span>
        </TableCell>
      ) : null}
    </>
  );
}

function TableHeadRow({
  nameLabel,
  showRevenue,
}: {
  nameLabel: string;
  showRevenue: boolean;
}) {
  return (
    // `.ct th`: no fill — a report table reads as figures under a hairline,
    // not as the registry's grey header bar (local override, TASK-692).
    <TableHeader className="bg-transparent">
      <TableRow className="hover:bg-transparent">
        <TableHead className={HEAD}>{nameLabel}</TableHead>
        <TableHead className={cn(HEAD, "text-right")}>{d.colUnits}</TableHead>
        <TableHead className={cn(HEAD, "text-right")}>{d.colOrders}</TableHead>
        {showRevenue ? (
          <TableHead className={cn(HEAD, "text-right")}>
            {d.colRevenue}
          </TableHead>
        ) : null}
      </TableRow>
    </TableHeader>
  );
}

function NothingSoldRow({ columns, id }: { columns: number; id?: string }) {
  return (
    <TableRow id={id} className="hover:bg-transparent">
      <TableCell
        colSpan={columns}
        className={cn(CELL, "text-muted-foreground")}
      >
        {d.nothingSold}
      </TableCell>
    </TableRow>
  );
}

function GrossNote() {
  return <p className="mt-2 text-xs text-muted-foreground">{d.grossNote}</p>;
}

/* ── Categories ────────────────────────────────────────────────────────── */

/** What a table needs of its root query (the hooks' result, narrowed). */
interface ReportState<T> {
  data?: { data: T };
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
}

type CategoryQueryResult = ReportState<CategoryReportEntity>;
type CategoryRow = CategoryReportRowEntity;

interface TreeContext {
  query: ReportQuery;
  expanded: ReadonlySet<string>;
  toggle: (categoryId: string) => void;
  showRevenue: boolean;
  maxRevenue: number;
  columns: number;
}

function CategoryTable({
  report,
  query,
  showRevenue,
  expanded,
  toggle,
}: {
  report: CategoryQueryResult;
  query: ReportQuery;
  showRevenue: boolean;
  expanded: ReadonlySet<string>;
  toggle: (categoryId: string) => void;
}) {
  const rows = report.data?.data.rows;

  if (report.isError) {
    return (
      <ReportLoadError
        onRetry={() => void report.refetch()}
        isRetrying={report.isFetching}
      />
    );
  }
  if (!rows) return <ReportBodySkeleton height="h-60" />;

  const context: TreeContext = {
    query,
    expanded,
    toggle,
    showRevenue,
    maxRevenue: maxRevenueOf(rows),
    columns: showRevenue ? 4 : 3,
  };

  return (
    <>
      <Table>
        <TableHeadRow nameLabel={d.colCategory} showRevenue={showRevenue} />
        <TableBody>
          {rows.length === 0 ? (
            <NothingSoldRow columns={context.columns} />
          ) : (
            rows.map((row) => (
              <CategoryRowGroup
                key={`${row.categoryId}:${row.direct}`}
                row={row}
                depth={0}
                context={context}
              />
            ))
          )}
        </TableBody>
      </Table>
      {showRevenue && rows.length ? <GrossNote /> : null}
    </>
  );
}

/**
 * One category row and, when it is open, its children — fetched on demand
 * (`parentId`) and drawn as further groups, so a child with children of its
 * own opens the same way.
 */
function CategoryRowGroup({
  row,
  depth,
  context,
  rowId,
}: {
  row: CategoryRow;
  depth: number;
  context: TreeContext;
  rowId?: string;
}) {
  const { query, expanded, toggle, showRevenue, maxRevenue, columns } = context;
  const open = row.hasChildren && expanded.has(row.categoryId);
  const children = useGetCategoryReport(
    { ...query, parentId: row.categoryId },
    { query: { enabled: open } },
  );
  const groupId = useId();
  const childRows = open ? children.data?.data.rows : undefined;
  const statusId = `${groupId}-status`;
  const childId = (index: number) => `${groupId}-${index}`;
  const controls = open
    ? childRows?.length
      ? childRows.map((_, index) => childId(index)).join(" ")
      : statusId
    : undefined;
  const padding = DEPTH_PADDING[Math.min(depth, DEPTH_PADDING.length - 1)];
  // The same words the CSV writes for this row.
  const label = categoryLabel(row);

  return (
    <>
      <TableRow id={rowId} data-depth={depth}>
        <TableCell className={cn(CELL, padding, "whitespace-normal")}>
          {row.hasChildren ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={controls}
              onClick={() => toggle(row.categoryId)}
              className={cn(
                "-my-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8",
                depth === 0 && "font-medium",
              )}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
                  open && "rotate-90",
                )}
              />
              {label}
            </button>
          ) : (
            <span
              className={cn(
                depth === 0 && "pl-5.5 font-medium",
                row.direct && "text-muted-foreground",
              )}
            >
              {label}
            </span>
          )}
        </TableCell>
        <FigureCells
          row={row}
          showRevenue={showRevenue}
          maxRevenue={maxRevenue}
        />
      </TableRow>

      {open ? (
        children.isError ? (
          <TableRow id={statusId} className="hover:bg-transparent">
            <TableCell colSpan={columns} className={cn(CELL, padding)}>
              <span className="flex flex-wrap items-center gap-3 text-sm text-destructive">
                {d.childrenError}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-foreground"
                  onClick={() => void children.refetch()}
                >
                  {dict.canon.retry}
                </Button>
              </span>
            </TableCell>
          </TableRow>
        ) : !childRows ? (
          <TableRow id={statusId} className="hover:bg-transparent">
            <TableCell
              colSpan={columns}
              className={cn(CELL, DEPTH_PADDING[Math.min(depth + 1, 4)])}
            >
              <span role="status" className="text-sm text-muted-foreground">
                {d.childrenLoading}
              </span>
            </TableCell>
          </TableRow>
        ) : childRows.length === 0 ? (
          <NothingSoldRow columns={columns} id={statusId} />
        ) : (
          childRows.map((child, index) => (
            <CategoryRowGroup
              key={`${child.categoryId}:${child.direct}`}
              row={child}
              depth={depth + 1}
              context={context}
              rowId={childId(index)}
            />
          ))
        )
      ) : null}
    </>
  );
}

/* ── Brands ────────────────────────────────────────────────────────────── */

function BrandTable({
  report,
  showRevenue,
}: {
  report: ReportState<BrandReportEntity>;
  showRevenue: boolean;
}) {
  const rows = report.data?.data.rows;

  if (report.isError) {
    return (
      <ReportLoadError
        onRetry={() => void report.refetch()}
        isRetrying={report.isFetching}
      />
    );
  }
  if (!rows) return <ReportBodySkeleton height="h-60" />;

  const maxRevenue = maxRevenueOf(rows);
  return (
    <>
      <Table>
        <TableHeadRow nameLabel={d.colBrand} showRevenue={showRevenue} />
        <TableBody>
          {rows.length === 0 ? (
            <NothingSoldRow columns={showRevenue ? 4 : 3} />
          ) : (
            rows.map((row) => (
              <TableRow key={row.brandId ?? "no-brand"}>
                <TableCell
                  className={cn(
                    CELL,
                    "font-medium whitespace-normal",
                    row.brandId === null && "text-muted-foreground",
                  )}
                >
                  {row.name ?? d.noBrand}
                </TableCell>
                <FigureCells
                  row={row}
                  showRevenue={showRevenue}
                  maxRevenue={maxRevenue}
                />
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {showRevenue && rows.length ? <GrossNote /> : null}
    </>
  );
}
