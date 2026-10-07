"use client";

import Link from "next/link";
import { InfoIcon } from "lucide-react";
import {
  stripTombstonePrefix,
  type AdminProductListItemEntity,
  type ProductEntity,
} from "@/entities/product";
import {
  Badge,
  REGISTRY_ROW_ACTION_WIDTH,
  REGISTRY_TRAILING_WIDTH,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { formatCurrency, formatDate, formatDateTime } from "@/shared/lib";

const d = dict.products;

/** The 1440 content area: 1440 − 256 (sidebar) − 48 (padding). */
const CONTENT_WIDTH_1440 = 1136;

/** Width the default-visible columns may share at 1440 (see `productColumns`). */
export const DEFAULT_WIDTH_BUDGET =
  CONTENT_WIDTH_1440 - 36 - REGISTRY_TRAILING_WIDTH - 2;

/**
 * The same budget in «Видалені» (TASK-656, Т8): no checkbox column, but the
 * trailing cell holds the outline «Відновити» instead of «⋯». It is the
 * tighter of the two, so the default widths are sized against it.
 */
export const DELETED_VIEW_WIDTH_BUDGET =
  CONTENT_WIDTH_1440 - REGISTRY_ROW_ACTION_WIDTH - 2;

/** Free stock at or below this reads as «мало» (the artboard's orange). */
export const LOW_STOCK = 5;

/** «без фото» or the 40×40 cover — after an import this column IS a worklist. */
export function ProductThumb({ product }: { product: ProductEntity }) {
  if (product.primaryImage?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts; next/image would need every one allowlisted
      <img
        src={product.primaryImage.url}
        alt=""
        loading="lazy"
        className="size-10 shrink-0 rounded-md border object-cover"
      />
    );
  }
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-warning/60 text-center text-2xs leading-tight font-medium text-warning">
      {d.noPhoto}
    </span>
  );
}

/**
 * The артикул as the operator typed it. A deleted product's comes back from
 * the list as `deleted:<id>:<sku>` — the view shows the native value, the one
 * a restore gives back (Т8).
 */
function displaySku(product: ProductEntity): string | null {
  return stripTombstonePrefix(product.sku, product.id);
}

function skuLine(product: ProductEntity): string {
  return (
    [displaySku(product), product.brand?.name].filter(Boolean).join(" · ") ||
    d.cardEmptyValue
  );
}

/**
 * «видалено 03.10.2026» from the tombstone's own `deletedAt` (TASK-1830) —
 * `updatedAt` can move after the delete (a cancelled order returning stock),
 * `deletedAt` is what «Видалені» is ordered by.
 */
function deletedOnText(product: AdminProductListItemEntity): string {
  return product.deletedAt
    ? d.deletedOn(formatDate(product.deletedAt))
    : d.cardEmptyValue;
}

/**
 * Т8: the date on one line — it never breaks away from its verb — and who
 * deleted it under it. `deletedBy` is null when the log has no staff actor
 * (or not yet, right after the delete): then there is no second line rather
 * than a made-up one.
 */
function DeletedOnCell({ product }: { product: AdminProductListItemEntity }) {
  const deletedBy = deletedByText(product);
  return (
    <span className="flex flex-col">
      <span className="whitespace-nowrap">{deletedOnText(product)}</span>
      {deletedBy ? (
        <span
          className="truncate text-xs"
          title={product.deletedBy?.name ?? deletedBy}
        >
          {deletedBy}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Who deleted it, as the row says it: the actor's name, or «співробітник» when
 * a person is on record without one — the API never sends another employee's
 * email in its place. `null` when nobody is on record (no second line).
 */
function deletedByText(product: AdminProductListItemEntity): string | null {
  if (!product.deletedBy) return null;
  const name = product.deletedBy.name;
  return name ? shortPersonName(name) : d.deletedByUnnamed;
}

/**
 * Т8 writes the deleter as «Олена К.»: first name and the surname's initial,
 * so the column stays narrow; the full name rides along in the cell's `title`.
 * A single-word name is shown as it is.
 */
export function shortPersonName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.trim();
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

/** «Видалено» — red, like the artboard's `bg-dst`: the row is not live. */
function DeletedBadge() {
  return <Badge variant="destructive">{d.deletedBadge}</Badge>;
}

function freeText(stock: number): string {
  return stock <= 0 ? d.stockNone : d.stockFree(stock);
}

function freeTone(stock: number): string {
  return stock <= LOW_STOCK ? "text-warning" : "text-foreground";
}

export function StatusBadge({ product }: { product: ProductEntity }) {
  return product.isActive ? (
    <Badge>{d.statusShown}</Badge>
  ) : (
    <Badge variant="secondary">{d.statusHidden}</Badge>
  );
}

function PriceCell({ product }: { product: ProductEntity }) {
  const old =
    product.compareAtPrice &&
    Number(product.compareAtPrice) > Number(product.price)
      ? formatCurrency(product.compareAtPrice)
      : null;
  return (
    <span className="flex flex-col items-end tabular-nums">
      <span className="font-medium text-foreground">
        {formatCurrency(product.price)}
      </span>
      {old ? (
        <>
          <span className="sr-only">{d.oldPriceAria(old)}</span>
          <s aria-hidden="true" className="text-xs text-muted-foreground">
            {old}
          </s>
        </>
      ) : null}
    </span>
  );
}

function StockCell({ product }: { product: ProductEntity }) {
  return (
    <span className="flex flex-col items-end tabular-nums">
      <span className={cn("font-medium", freeTone(product.stock))}>
        {freeText(product.stock)}
      </span>
      <span className="text-xs text-muted-foreground">
        {product.reservedQty > 0
          ? `${d.stockReserved(product.reservedQty)} · `
          : ""}
        {d.stockPhysical(product.physicalQty)}
      </span>
    </span>
  );
}

/**
 * «Залишок» + an info tooltip with the artboard text (Т4). The tooltip is for
 * the pointer; the sort button carries the same sentence as its description
 * (`sortHint`), which is what a keyboard or screen-reader user gets.
 */
function StockHeader() {
  return (
    <span className="inline-flex items-center gap-1">
      {d.colStock}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-hidden="true"
            className="inline-flex text-muted-foreground"
            data-registry-interactive=""
          >
            <InfoIcon className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">
          <p>
            <b>{d.stockHintFree}</b> {d.stockHintFreeText}
          </p>
          <p>
            <b>{d.stockHintReserved}</b> {d.stockHintReservedText}
          </p>
          <p>
            <b>{d.stockHintPhysical}</b> {d.stockHintPhysicalText}
          </p>
          <p className="mt-1 text-muted-foreground">{d.stockHintRenamed}</p>
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

interface ColumnOptions {
  /** A tombstone has no card to link to. */
  isDeletedView: boolean;
  categoryNames: ReadonlyMap<string, string>;
}

/**
 * The registry's columns (ProductsProposal Т1). Sortable only where
 * `GET /products/admin/list` sorts: name, price, stock and creation date —
 * «Оновлено» is shown, not sorted (the API has no `updatedAt` sort), and
 * «Створено» keeps its sort behind «Колонки». In «Видалені» the same column
 * shows the deletion date and sorts by it (`deletedAt`, TASK-1830) — the
 * view's own default order, now visible.
 *
 * Default widths are budgeted to fit the 1440 layout without a sideways
 * scroll: content ≈ 1440 − 256 (sidebar) − 48 (padding) = 1136 px, of which
 * the checkbox (36) and «⋯» (44) columns take 80 — so the default-visible
 * columns share at most {@link DEFAULT_WIDTH_BUDGET}. «Видалені» trades both
 * for the 112 px «Відновити» cell ({@link DELETED_VIEW_WIDTH_BUDGET}, the
 * tighter one — hence «Назва» at 268, TASK-656; «Оновлено» at 164 keeps
 * «видалено 15.09.2026» on one line). The widths are the SAME in
 * both views on purpose: the registry persists one set per table, so a
 * per-view default would be overwritten by the first resize in either.
 *
 * In «Видалені» (Т8) the «Оновлено» cell reads «видалено 03.10.2026» over
 * who deleted it, and the totals row carries no free-stock sum — a tombstone
 * sells nothing.
 */
export function productColumns({
  isDeletedView,
  categoryNames,
}: ColumnOptions): RegistryColumn<AdminProductListItemEntity>[] {
  return [
    {
      id: "photo",
      label: d.colPhoto,
      resizable: false,
      defaultWidth: 60,
      minWidth: 56,
      cell: (product) => <ProductThumb product={product} />,
    },
    {
      id: "name",
      label: d.colName,
      locked: true,
      sortField: "name",
      defaultWidth: 268,
      minWidth: 180,
      cell: (product) => (
        <span className="flex flex-col gap-0.5">
          {isDeletedView ? (
            <span className="font-medium text-foreground">{product.name}</span>
          ) : (
            <Link
              href={`/products/${product.id}`}
              className="rounded-xs font-medium text-foreground outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {product.name}
            </Link>
          )}
          <span className="text-xs text-muted-foreground">
            {skuLine(product)}
          </span>
        </span>
      ),
    },
    {
      id: "category",
      label: d.colCategory,
      defaultWidth: 136,
      className: "text-muted-foreground",
      cell: (product) =>
        categoryNames.get(product.categoryId) ?? d.cardEmptyValue,
    },
    {
      id: "price",
      label: d.colPrice,
      align: "end",
      sortField: "price",
      defaultWidth: 110,
      cell: (product) => <PriceCell product={product} />,
    },
    {
      id: "stock",
      label: d.colStock,
      header: <StockHeader />,
      align: "end",
      sortField: "stock",
      sortHint: d.colStockHint,
      sortHintAsTitle: false,
      defaultWidth: 160,
      cell: (product) => <StockCell product={product} />,
      footer: isDeletedView
        ? undefined
        : (rows) =>
            d.totalsFree(
              rows.reduce((sum, row) => sum + Math.max(0, row.stock), 0),
            ),
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 124,
      cell: (product) =>
        isDeletedView ? <DeletedBadge /> : <StatusBadge product={product} />,
    },
    {
      id: "updated",
      label: d.colUpdated,
      ...(isDeletedView
        ? { sortField: "deletedAt", sortHint: d.colDeletedSortHint }
        : {}),
      defaultWidth: 164,
      className: "text-muted-foreground tabular-nums",
      cell: (product) =>
        isDeletedView ? (
          <DeletedOnCell product={product} />
        ) : (
          formatDateTime(product.updatedAt)
        ),
    },
    {
      id: "created",
      label: d.colCreated,
      sortField: "createdAt",
      defaultVisible: false,
      defaultWidth: 150,
      className: "text-muted-foreground tabular-nums",
      cell: (product) => formatDateTime(product.createdAt),
    },
  ];
}

/**
 * One product below md (ProductsProposal Т7; «Видалені» — Т12, where the
 * status line is the red «Видалено» and `parts.actions` is «Відновити»).
 */
export function productCardRenderer({
  isDeletedView,
}: Pick<ColumnOptions, "isDeletedView">) {
  return function renderProductCard(
    product: AdminProductListItemEntity,
    parts: RegistryCardParts,
  ) {
    return (
      <ProductCard
        product={product}
        parts={parts}
        isDeletedView={isDeletedView}
      />
    );
  };
}

function ProductCard({
  product,
  parts,
  isDeletedView,
}: {
  product: AdminProductListItemEntity;
  parts: RegistryCardParts;
  isDeletedView: boolean;
}) {
  return (
    <div className="flex gap-3">
      {parts.select ? <div className="pt-0.5">{parts.select}</div> : null}
      <ProductThumb product={product} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {parts.href ? (
          <Link
            href={parts.href}
            className="rounded-xs font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {product.name}
          </Link>
        ) : (
          <span className="font-medium text-foreground">{product.name}</span>
        )}
        <span className="text-xs break-all text-muted-foreground">
          {displaySku(product) || d.cardEmptyValue}
        </span>
        {isDeletedView ? (
          // Т12: when — and by whom — it was deleted, as on the table row.
          <span className="text-xs text-muted-foreground tabular-nums">
            {product.deletedBy
              ? `${deletedOnText(product)} · ${deletedByText(product)}`
              : deletedOnText(product)}
          </span>
        ) : null}
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-foreground tabular-nums">
            {formatCurrency(product.price)}
          </span>
          <span
            className={cn(
              "text-sm font-medium tabular-nums",
              freeTone(product.stock),
            )}
          >
            {freeText(product.stock)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          {isDeletedView ? <DeletedBadge /> : <StatusBadge product={product} />}
          {parts.actions}
        </div>
      </div>
    </div>
  );
}
