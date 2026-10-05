import { useId } from "react";
import Link from "next/link";
import { InfoIcon } from "lucide-react";
import type { BrandEntity } from "@/entities/brand";
import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  type RegistryCardParts,
  type RegistryColumn,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";

const d = dict.brands;

/**
 * Width the default-visible columns may share at 1440: the content area 1136
 * minus the «⋯» column and the box border. No checkbox column — there is no
 * bulk endpoint for brands, so there is nothing to select for.
 */
export const BRAND_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/** Where «Товари бренду» and the count link go — the products registry's own filter. */
export const brandProductsHref = (brand: BrandEntity) =>
  `/products?brandId=${encodeURIComponent(brand.id)}`;

/**
 * The API documents a brand logo as "absolute or storefront-relative". A
 * storefront-relative path (`/brands/spigen.svg`) would resolve against the
 * ADMIN origin here and render a broken image, so it is anchored to the
 * storefront. Anything unparsable is passed through untouched — a broken
 * thumbnail is a smaller failure than a crashed table.
 */
export function logoSrc(logo: string): string {
  if (!logo.startsWith("/") || logo.startsWith("//")) return logo;
  try {
    return new URL(logo, STOREFRONT_URL).toString();
  } catch {
    return logo;
  }
}

/** «Apple» → «Ap», «Baseus Official» → «BO», «JBL» → «JB». */
export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const word = words[0] ?? "";
  return word.slice(0, 2);
}

/**
 * The 40×40 logo, or a grey square with the first letters (БР1) — the old
 * «без лого» text read as a status, and a column of it was noise. The initials
 * are decoration: the name sits right beside them.
 */
export function BrandLogo({ brand }: { brand: BrandEntity }) {
  if (brand.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts; next/image would need every one allowlisted
      <img
        src={logoSrc(brand.logo)}
        alt={d.logoAlt(brand.name)}
        loading="lazy"
        className="size-10 shrink-0 rounded-md border bg-background object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground"
    >
      {brandInitials(brand.name)}
    </span>
  );
}

/** «Показується / Приховано» — the status canon (§1.6). */
export function BrandStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? "default" : "secondary"}>
      {isActive ? d.statusActive : d.statusInactive}
    </Badge>
  );
}

/**
 * «Товарів ⓘ». The ⓘ is a real button so the keyboard reaches the
 * explanation too; its description is the same sentence the tooltip shows.
 */
function ProductsHeader() {
  const hintId = useId();
  return (
    <span className="inline-flex items-center gap-1">
      {d.colProducts}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={d.colProductsHintAria}
            aria-describedby={hintId}
            data-registry-interactive=""
            className="inline-flex rounded-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <InfoIcon aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-60">
          {d.colProductsHint}
        </TooltipContent>
      </Tooltip>
      <span id={hintId} hidden>
        {d.colProductsHint}
      </span>
    </span>
  );
}

/**
 * The count, as a link into «Товари» filtered by the brand — only for a
 * session that can open «Товари» (`products:read`); otherwise a plain number.
 * Absent only if the API predates TASK-840 — a dash, not a claimed zero.
 */
export function BrandProductCount({
  brand,
  canOpenProducts,
}: {
  brand: BrandEntity;
  canOpenProducts: boolean;
}) {
  const count = brand.productCount;
  if (count === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (!canOpenProducts || count === 0) {
    return (
      <span className={count === 0 ? "text-muted-foreground" : undefined}>
        {count}
      </span>
    );
  }
  return (
    <Link
      href={brandProductsHref(brand)}
      aria-label={d.productsLinkAria(count, brand.name)}
      className="rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {count}
    </Link>
  );
}

/** Columns of the brand registry (BrandsProposal БР1). The API sorts by name only. */
export function buildBrandColumns({
  canOpenProducts,
}: {
  canOpenProducts: boolean;
}): RegistryColumn<BrandEntity>[] {
  return [
    {
      id: "logo",
      label: d.colLogo,
      defaultWidth: 72,
      minWidth: 64,
      resizable: false,
      cell: (brand) => <BrandLogo brand={brand} />,
    },
    {
      id: "name",
      label: d.colName,
      locked: true,
      rowLink: true,
      defaultWidth: 520,
      minWidth: 200,
      cell: (brand) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground">
            {brand.name}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {brand.slug}
          </span>
        </span>
      ),
    },
    {
      id: "products",
      label: d.colProducts,
      header: <ProductsHeader />,
      align: "end",
      defaultWidth: 136,
      minWidth: 112,
      className: "tabular-nums",
      cell: (brand) => (
        <BrandProductCount brand={brand} canOpenProducts={canOpenProducts} />
      ),
    },
    {
      id: "status",
      label: d.colStatus,
      defaultWidth: 200,
      minWidth: 128,
      cell: (brand) => <BrandStatusBadge isActive={brand.isActive} />,
    },
  ];
}

/** One brand below md (БР3): logo, name, «N товарів» and the status. */
export function renderBrandCard(brand: BrandEntity, parts: RegistryCardParts) {
  const name = (
    <span className="truncate font-medium text-foreground">{brand.name}</span>
  );
  return (
    <div className="flex items-center gap-3">
      <BrandLogo brand={brand} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {parts.href ? (
          <Link
            href={parts.href}
            className="min-w-0 truncate rounded-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {name}
          </Link>
        ) : (
          name
        )}
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {brand.productCount !== undefined ? (
            <span>{d.productsCount(brand.productCount)}</span>
          ) : null}
          <BrandStatusBadge isActive={brand.isActive} />
        </span>
      </div>
      {parts.actions}
    </div>
  );
}
