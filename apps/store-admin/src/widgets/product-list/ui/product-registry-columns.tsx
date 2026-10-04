"use client";

import Link from "next/link";
import { InfoIcon } from "lucide-react";
import type { ProductEntity } from "@/entities/product";
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { formatCurrency, formatDateTime } from "@/shared/lib";

const d = dict.products;

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

function skuLine(product: ProductEntity): string {
  return (
    [product.sku, product.brand?.name].filter(Boolean).join(" · ") ||
    d.cardEmptyValue
  );
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
 * «Створено» keeps its sort behind «Колонки».
 */
export function productColumns({
  isDeletedView,
  categoryNames,
}: ColumnOptions): RegistryColumn<ProductEntity>[] {
  return [
    {
      id: "photo",
      label: d.colPhoto,
      resizable: false,
      defaultWidth: 64,
      minWidth: 56,
      cell: (product) => <ProductThumb product={product} />,
    },
    {
      id: "name",
      label: d.colName,
      locked: true,
      sortField: "name",
      defaultWidth: 340,
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
      defaultWidth: 170,
      className: "text-muted-foreground",
      cell: (product) =>
        categoryNames.get(product.categoryId) ?? d.cardEmptyValue,
    },
    {
      id: "price",
      label: d.colPrice,
      align: "end",
      sortField: "price",
      defaultWidth: 120,
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
      defaultWidth: 180,
      cell: (product) => <StockCell product={product} />,
      footer: (rows) =>
        d.totalsFree(
          rows.reduce((sum, row) => sum + Math.max(0, row.stock), 0),
        ),
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 140,
      cell: (product) =>
        isDeletedView ? (
          <Badge variant="secondary">{d.deletedBadge}</Badge>
        ) : (
          <StatusBadge product={product} />
        ),
    },
    {
      id: "updated",
      label: d.colUpdated,
      defaultWidth: 150,
      className: "text-muted-foreground tabular-nums",
      cell: (product) => formatDateTime(product.updatedAt),
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

/** One product below md (ProductsProposal Т7). */
export function renderProductCard(
  product: ProductEntity,
  parts: RegistryCardParts,
) {
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
          {product.sku || d.cardEmptyValue}
        </span>
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
          <StatusBadge product={product} />
          {parts.actions}
        </div>
      </div>
    </div>
  );
}
