"use client";

import type { ProductGroupSummaryEntity } from "@/entities/product-group";
import { Badge, type RegistryColumn } from "@/shared/ui";
import { dict } from "@/shared/config";

const g = dict.productGroups;

/**
 * Width budget of the default columns at 1440 (wave 198 canon): the 1136 px
 * content area minus the «⋯» column (44) and the border (2). No checkbox
 * column — bulk regrouping lives on the product list.
 */
export const PRODUCT_GROUP_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/**
 * «Активна / Неактивна», deliberately not the canon «Показується /
 * Приховано»: the group flag does not reach the storefront yet (TASK-1031).
 */
export function ProductGroupStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? g.statusActive : g.statusInactive}
    </Badge>
  );
}

/** The axes as badges, in their site order. */
export function ProductGroupAxes({
  group,
}: {
  group: ProductGroupSummaryEntity;
}) {
  if (group.axes.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {[...group.axes]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((axis) => (
          <Badge key={axis.name} variant="outline">
            {axis.name}
          </Badge>
        ))}
    </span>
  );
}

/**
 * The registry columns (ProductGroupsProposal ГТ1). Not here, because the
 * list payload (`ProductGroupSummaryEntity`) has no such data — API tails:
 * the category under the name, «показується N з M», per-group problems and
 * «Ціни».
 */
export const PRODUCT_GROUP_COLUMNS: readonly RegistryColumn<ProductGroupSummaryEntity>[] =
  [
    {
      id: "name",
      label: g.colName,
      locked: true,
      rowLink: true,
      defaultWidth: 500,
      minWidth: 200,
      cell: (group) => (
        <span className="font-medium break-words text-foreground">
          {group.name}
        </span>
      ),
    },
    {
      id: "axes",
      label: g.colAxes,
      defaultWidth: 300,
      minWidth: 140,
      cell: (group) => <ProductGroupAxes group={group} />,
    },
    {
      id: "positions",
      label: g.colPositions,
      align: "end",
      defaultWidth: 130,
      minWidth: 90,
      cell: (group) => (
        <span className="flex flex-col items-end gap-0.5">
          <span className="text-foreground tabular-nums">
            {group.positionCount}
          </span>
          {group.positionCount === 0 ? (
            <span className="text-xs text-destructive">{g.noPositions}</span>
          ) : null}
        </span>
      ),
    },
    {
      id: "status",
      label: g.colStatus,
      defaultWidth: 150,
      minWidth: 110,
      cell: (group) => <ProductGroupStatusBadge isActive={group.isActive} />,
    },
  ];
