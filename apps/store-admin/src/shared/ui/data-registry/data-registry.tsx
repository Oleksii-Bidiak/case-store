"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/shared/lib/utils";
import type { PluralForms } from "@/shared/lib/plural";
import { TablePagination } from "../data-table/table-pagination";
import { ColumnsMenu } from "./columns-menu";
import {
  FilterChips,
  QuickViews,
  quickViewTabId,
  RegistryHeader,
  RegistrySummary,
  type FilterChip,
  type QuickView,
} from "./registry-chrome";
import { RegistryBulkBar } from "./registry-bulk-bar";
import {
  RegistryTable,
  type RegistryCardParts,
  type RegistryRowGroup,
  type RegistrySort,
} from "./registry-table";
import { RegistryToolbar, type RegistrySearch } from "./registry-toolbar";
import type { RowActionItem } from "./row-actions-menu";
import type { DataRegistryController } from "./use-data-registry";
import { ViewsMenu } from "./views-menu";

export interface DataRegistryProps<T> {
  registry: DataRegistryController<T>;

  /* header */
  /** The screen's name — the header's title and the table's accessible name. */
  title: string;
  /**
   * `false` when the PAGE draws the header itself — e.g. because it must stay
   * on screen above a permission refusal, or a standing strip sits between the
   * header and the toolbar (Staff С1). `title` still names the table. Default
   * `true`.
   */
  showHeader?: boolean;
  description?: React.ReactNode;
  /** Export menu + the primary CTA. The caller gates the CTA by permission. */
  headerActions?: React.ReactNode;

  /* quick views */
  quickViews?: {
    items: readonly QuickView[];
    activeId: string;
    onChange: (id: string) => void;
  };

  /* toolbar */
  search: RegistrySearch;
  /** «Фільтри»: the count of applied filters, and the sheet to open. */
  filters?: {
    count: number;
    renderSheet: (state: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => React.ReactNode;
  };
  /** «Вид»: saved views. Omit on a screen that does not offer them. */
  views?: { defaultName: string };
  /** «Колонки». Default `true`. */
  columnsMenu?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;

  /* chips + summary */
  /**
   * A standing explanation between the toolbar and the chips — e.g. the
   * «Схоже на накрутку…» card over a flagged series (ReviewsProposal В3) or the
   * «Спам» explanation (MessagesProposal З4). Usually a `Callout`.
   */
  notice?: React.ReactNode;
  chips?: readonly FilterChip[];
  onClearAllChips?: () => void;
  summary?: React.ReactNode;
  sortLabel?: string;
  updatedAt?: Date | number;

  /* rows */
  /** What a row is called, in three forms: totals, bulk bar. */
  itemForms: PluralForms;
  getRowLabel: (row: T) => string;
  getRowHref?: (row: T) => string | undefined;
  /** Opens the record in place (a sheet) on a row click — see RegistryTable. */
  onRowOpen?: (row: T) => void;
  /** Extra classes per row / card (an unread tint). */
  rowClassName?: (row: T) => string | undefined;
  rowActions?: (row: T) => readonly RowActionItem[];
  rowActionsLabel?: (row: T) => string;
  sort?: RegistrySort;
  totals?: boolean;
  renderCard?: (row: T, parts: RegistryCardParts) => React.ReactNode;
  /** Section headings between runs of rows — see `RegistryTable.groupBy`. */
  groupBy?: (row: T) => RegistryRowGroup | null;
  /** A row's detail panel — see `RegistryTable.renderExpanded`. */
  renderExpanded?: (row: T) => React.ReactNode;
  expandLabel?: (row: T) => string;

  /* selection + bulk */
  selectable?: boolean;
  bulk?: {
    idleHint: React.ReactNode;
    actions?: React.ReactNode;
    /** Receives the selected ids — across pages. */
    onExportSelected?: (ids: string[]) => void;
    overflow?: readonly RowActionItem[];
    /** Keep «⋯» on the idle bar (see `RegistryBulkBar.overflowWhenIdle`). */
    overflowWhenIdle?: boolean;
    isPending?: boolean;
  };

  /* states */
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: React.ReactNode;
  onRetry?: () => void;
  isRetrying?: boolean;
  isRefetching?: boolean;
  emptyState: React.ReactNode;
  searchQuery?: string;
  isFiltered?: boolean;

  /* pagination */
  pagination?: {
    page: number;
    totalPages: number;
    pageSize: number;
    hidePageSize?: boolean;
  };

  className?: string;
}

/**
 * The admin's ONE list screen (wave 198, TASK-1043), composed top to bottom:
 * header → quick views → toolbar → chips → summary → bulk bar → table (cards
 * below md) → pagination. Every piece is exported on its own for a screen that
 * needs a different arrangement; this wrapper is the arrangement the owner
 * signed off on, so most screens should only describe columns and filters.
 */
export function DataRegistry<T>({
  registry,
  title,
  showHeader = true,
  description,
  headerActions,
  quickViews,
  search,
  filters,
  views,
  columnsMenu = true,
  onRefresh,
  isRefreshing,
  notice,
  chips = [],
  onClearAllChips,
  summary,
  sortLabel,
  updatedAt,
  itemForms,
  getRowLabel,
  getRowHref,
  onRowOpen,
  rowClassName,
  rowActions,
  rowActionsLabel,
  sort,
  totals,
  renderCard,
  groupBy,
  renderExpanded,
  expandLabel,
  selectable = false,
  bulk,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  isRetrying,
  isRefetching,
  emptyState,
  searchQuery,
  isFiltered,
  pagination,
  className,
}: DataRegistryProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const { settings, selection } = registry;
  const viewsIdPrefix = React.useId();
  const viewsPanelId = `${viewsIdPrefix}-panel`;
  const activeViewTab =
    quickViews &&
    quickViews.items.some((item) => item.id === quickViews.activeId)
      ? quickViewTabId(viewsIdPrefix, quickViews.activeId)
      : undefined;

  const navigateTo = (query: string) =>
    router.replace(query ? `${pathname}?${query}` : pathname);

  const currentQuery = () => {
    const params = new URLSearchParams(searchParams.toString());
    // Which page you were on is not part of a view.
    params.delete("page");
    return params.toString();
  };

  return (
    <div
      data-slot="data-registry"
      className={cn("flex flex-col gap-4", className)}
    >
      {showHeader ? (
        <RegistryHeader
          title={title}
          description={description}
          actions={headerActions}
        />
      ) : null}
      {quickViews ? (
        <QuickViews
          {...quickViews}
          panel={{ idPrefix: viewsIdPrefix, panelId: viewsPanelId }}
        />
      ) : null}

      {/* The quick views are tabs; this is what they switch. */}
      <div
        id={quickViews ? viewsPanelId : undefined}
        role={quickViews ? "tabpanel" : undefined}
        aria-labelledby={activeViewTab}
        aria-label={quickViews && !activeViewTab ? title : undefined}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-3">
          <RegistryToolbar
            search={search}
            filters={
              filters
                ? {
                    count: filters.count,
                    open: filtersOpen,
                    onOpenChange: setFiltersOpen,
                  }
                : undefined
            }
            columnsMenu={
              columnsMenu ? (
                <ColumnsMenu columns={registry.columns} settings={settings} />
              ) : null
            }
            viewsMenu={
              views ? (
                <ViewsMenu
                  defaultName={views.defaultName}
                  views={settings.settings.views}
                  activeViewId={settings.settings.activeViewId}
                  onApply={(id) => {
                    const query = settings.applyView(id);
                    if (query !== null) navigateTo(query);
                  }}
                  onSave={(name) => settings.saveView(name, currentQuery())}
                  onRename={settings.renameView}
                  onDelete={settings.deleteView}
                />
              ) : null
            }
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
          />
          {notice}
          <FilterChips chips={chips} onClearAll={onClearAllChips} />
          <RegistrySummary sortLabel={sortLabel} updatedAt={updatedAt}>
            {summary}
          </RegistrySummary>
          {selectable && bulk ? (
            <RegistryBulkBar
              selectedCount={selection.selectedCount}
              itemForms={itemForms}
              idleHint={bulk.idleHint}
              actions={bulk.actions}
              onExportSelected={
                bulk.onExportSelected
                  ? () => bulk.onExportSelected?.([...selection.selectedIds])
                  : undefined
              }
              overflow={bulk.overflow}
              overflowWhenIdle={bulk.overflowWhenIdle}
              isPending={bulk.isPending}
              onClear={selection.clear}
            />
          ) : null}
        </div>

        <RegistryTable
          label={title}
          columns={registry.visibleColumns}
          rows={registry.rows}
          getRowId={registry.getRowId}
          getRowLabel={getRowLabel}
          getRowHref={getRowHref}
          onRowOpen={onRowOpen}
          rowClassName={rowClassName}
          widths={registry.widths}
          onResize={settings.setWidth}
          density={settings.settings.density}
          selection={selectable ? selection : undefined}
          rowActions={rowActions}
          rowActionsLabel={rowActionsLabel}
          sort={sort}
          totals={totals}
          itemForms={itemForms}
          renderCard={renderCard}
          groupBy={groupBy}
          renderExpanded={renderExpanded}
          expandLabel={expandLabel}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          onRetry={onRetry}
          isRetrying={isRetrying}
          isRefetching={isRefetching}
          emptyState={emptyState}
          searchQuery={searchQuery}
          isFiltered={isFiltered}
        />

        {pagination ? (
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            hidePageSize={pagination.hidePageSize}
          />
        ) : null}
      </div>

      {filters?.renderSheet({
        open: filtersOpen,
        onOpenChange: setFiltersOpen,
      })}
    </div>
  );
}
