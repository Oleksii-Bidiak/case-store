"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CircleAlertIcon,
  CopyIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  ImageOffIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
import {
  useProductControllerPreviewProductBySlug,
  type ProductEntity,
  type ProductGroupEntity,
  type ProductImageEntity,
  type ProductSiblingEntity,
} from "@/entities/product";
import { useCategoryControllerFindBySlug } from "@/entities/category";
import { useProductGroupControllerFindById } from "@/entities/product-group";
import { useAddonServiceControllerAdminResolveForProduct } from "@/entities/addon-service";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { Badge, Button, RichTextPreview } from "@/shared/ui";
import { toast } from "@/shared/ui/toast";
import { cn, formatCurrency } from "@/shared/lib";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { AdminProductPreviewSkeleton } from "./admin-product-preview-skeleton";
import { OverviewBreadcrumb } from "./overview-breadcrumb";
import {
  GroupCard,
  HistoryCard,
  SeoCard,
  StockCard,
  VisibilityChecklist,
  type CheckState,
  type VisibilityCheck,
} from "./overview-cards";

const o = dict.productOverview;

interface AdminProductPreviewViewProps {
  slug: string;
}

/**
 * «← Товари» back to the list the operator came from — filters included —
 * when the previous page was that list on this origin; the plain list
 * otherwise. Read through `useSyncExternalStore`: `document` does not exist on
 * the server, whose snapshot is the plain list.
 */
const LIST_HREF = "/products";
const noSubscription = () => () => {};
function listHrefFromReferrer(): string {
  try {
    const previous = new URL(document.referrer);
    if (
      previous.origin === window.location.origin &&
      previous.pathname === LIST_HREF
    ) {
      return `${LIST_HREF}${previous.search}`;
    }
  } catch {
    // No referrer (opened in a new tab): the plain list.
  }
  return LIST_HREF;
}
function useBackHref(): string {
  return useSyncExternalStore(
    noSubscription,
    listHrefFromReferrer,
    () => LIST_HREF,
  );
}

/**
 * «Огляд товару» (wave 198, ProductPreviewProposal ПП1–ПП10, TASK-1087) — the
 * staff overview of one product by slug, INCLUDING deactivated ones
 * (TASK-155). Plan 186 settled «inspector or preview»: the customer's view is
 * the storefront itself («Подивитись на сайті»; the temporary link for a hidden
 * product is TASK-670), and this page is the service overview — stock,
 * visibility, SEO, the group and the history — so it is called «Огляд».
 *
 * Nothing that was here disappeared: the hidden banner (now with the reason),
 * the active/inactive badge, the stock split (TASK-254), price and old price,
 * category and SKU, attributes (with the structured specs), description (now
 * RENDERED — the editor's tags used to show literally), the group's positions
 * (now all of them, a hidden one marked), the edit link (now gated by
 * `products:write`, the key the edit form needs).
 *
 * Reads beyond the preview payload, each with the key its endpoint asks for:
 * the category's public visibility (`GET /categories/:slug` — 404 for a hidden
 * one, no key), the group's own record (`products:read`), the resolved add-ons
 * (`products:read`), the action log (`audit:read`, so only for its holders).
 */
export function AdminProductPreviewView({
  slug,
}: AdminProductPreviewViewProps) {
  const backHref = useBackHref();
  const { data, isLoading, isError, error, refetch, isFetching } =
    useProductControllerPreviewProductBySlug(slug);

  if (isLoading) return <AdminProductPreviewSkeleton />;

  if (isError || !data) {
    const notFound = error?.response?.status === 404 || (!isError && !data);
    return (
      <div className="flex max-w-300 flex-col gap-4">
        <OverviewBreadcrumb href={backHref} />
        <div className="flex max-w-xl flex-col gap-3 rounded-lg border bg-card p-5 shadow-card">
          {notFound ? (
            <SearchIcon
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
          ) : (
            <CircleAlertIcon
              aria-hidden="true"
              className="size-5 text-muted-foreground"
            />
          )}
          <h2 className="text-base font-semibold text-foreground">
            {notFound ? o.notFound : o.loadError}
          </h2>
          <p role="alert" className="text-sm text-muted-foreground">
            {notFound ? o.notFoundHint : o.loadErrorHint}
          </p>
          <div className="flex flex-wrap gap-3">
            {notFound ? null : (
              <Button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
              >
                <RotateCcwIcon aria-hidden="true" />
                {o.retry}
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/products">{o.toList}</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProductOverview
      backHref={backHref}
      product={data.data}
      category={data.category}
      images={data.images}
      previewGroup={data.group}
    />
  );
}

function ProductOverview({
  backHref,
  product,
  category,
  images,
  previewGroup,
}: {
  backHref: string;
  product: ProductEntity;
  category: { id: string; name: string; slug: string };
  images: ProductImageEntity[];
  previewGroup: ProductGroupEntity | null;
}) {
  const { can } = useAuth();
  const canWrite = can(PERM.productsWrite);
  const canEditCategory = can(PERM.categoriesWrite);
  const canReadLog = can(PERM.auditRead);

  const categoryQuery = useCategoryControllerFindBySlug(category.slug, {
    query: { retry: false },
  });
  const categoryState: CheckState = categoryQuery.isSuccess
    ? "ok"
    : categoryQuery.error?.response?.status === 404
      ? "fail"
      : "unknown";

  const groupId = product.groupId ?? previewGroup?.id ?? null;
  const groupQuery = useProductGroupControllerFindById(groupId ?? "", {
    query: { enabled: Boolean(groupId) },
  });
  const addonsQuery = useAddonServiceControllerAdminResolveForProduct(
    product.id,
  );

  const isPublic = product.isActive && categoryState !== "fail";
  const editHref = `/products/${product.id}/edit`;
  const address = `/products/${product.slug}`;

  const checks: VisibilityCheck[] = [
    {
      id: "active",
      label: product.isActive ? o.visEnabled : o.visDisabled,
      state: product.isActive ? "ok" : "fail",
      fix:
        !product.isActive && canWrite
          ? { href: editHref, label: o.visFixEnable }
          : undefined,
    },
    // The preview endpoint never returns a soft-deleted product (404).
    { id: "deleted", label: o.visNotDeleted, state: "ok" },
    {
      id: "category",
      label:
        categoryState === "ok"
          ? o.visCategoryShown(category.name)
          : categoryState === "fail"
            ? o.visCategoryHidden(category.name)
            : o.visCategoryUnknown(category.name),
      state: categoryState,
      fix:
        categoryState === "fail" && canEditCategory
          ? { href: `/categories/${category.id}/edit`, label: o.visFixCategory }
          : undefined,
    },
  ];

  // The group's own record lists every non-deleted position; the preview's
  // list holds only the live ones, so a hidden product is added back to it.
  const groupRecord = groupQuery.data?.data;
  const fallbackPositions = previewGroup?.positions ?? [];
  const positions = groupRecord
    ? groupRecord.positions
    : fallbackPositions.some((position) => position.id === product.id)
      ? fallbackPositions
      : [
          {
            id: product.id,
            slug: product.slug,
            name: product.name,
            price: product.price,
            attributes: (product.attributes ??
              {}) as ProductSiblingEntity["attributes"],
            stock: product.stock,
            isActive: product.isActive,
            positionOrder: product.positionOrder,
          },
          ...fallbackPositions,
        ].sort((a, b) => a.positionOrder - b.positionOrder);
  const axes = groupRecord?.axes ?? previewGroup?.axes ?? [];

  const copyAddress = () => {
    const write = navigator.clipboard?.writeText(address);
    if (!write) {
      toast.error(o.copyFailed);
      return;
    }
    write.then(
      () => toast.success(o.addressCopied),
      () => toast.error(o.copyFailed),
    );
  };

  return (
    <div className="flex max-w-300 flex-col gap-4">
      <OverviewBreadcrumb href={backHref} />

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {product.name}
            </h2>
            <Badge
              variant="outline"
              className={cn(
                "border-transparent",
                isPublic
                  ? "bg-success/15 text-foreground"
                  : "bg-secondary text-secondary-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full",
                  isPublic ? "bg-success" : "bg-foreground",
                )}
              />
              {isPublic ? o.onSite : o.hidden}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-xs break-all text-muted-foreground">
              {address}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={o.copyAddress}
              className="text-muted-foreground"
              onClick={copyAddress}
            >
              <CopyIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isPublic ? (
            <Button asChild variant="outline" className="max-md:flex-1">
              <a
                href={`${STOREFRONT_URL}/products/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon aria-hidden="true" />
                {o.viewOnSite}
              </a>
            </Button>
          ) : null}
          {canWrite ? (
            <Button asChild className="max-md:flex-1">
              <Link href={editHref}>
                <PencilIcon aria-hidden="true" />
                {o.edit}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{o.intro}</p>

      {!isPublic ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/6 px-3 py-2.5 text-sm text-foreground">
          <EyeOffIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
          <p>
            <strong>{o.hiddenLead}</strong>{" "}
            {product.isActive
              ? o.hiddenWhyCategory(category.name)
              : o.hiddenWhyOff}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-5 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <Photos product={product} images={images} />
          <Facts
            product={product}
            category={category}
            canEditCategory={canEditCategory}
            addons={(addonsQuery.data?.data ?? []).map((addon) => addon.name)}
          />
          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {o.description}
            </h3>
            <RichTextPreview
              html={product.description ?? ""}
              emptyLabel={o.descriptionEmpty}
            />
          </section>
          <Specs product={product} />
          <section className="flex flex-col gap-2">
            <h3 className="text-base font-semibold text-foreground">
              {o.compat}
            </h3>
            {(product.compatibleDeviceModels ?? []).length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {(product.compatibleDeviceModels ?? []).map((model) => (
                  <li key={model.id}>
                    <Badge variant="secondary">{model.name}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{o.compatEmpty}</p>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <VisibilityChecklist checks={checks} />
          <StockCard product={product} />
          <SeoCard product={product} />
          <GroupCard
            product={product}
            groupId={groupId}
            axes={axes}
            positions={groupId ? positions : []}
          />
          {canReadLog ? <HistoryCard productId={product.id} /> : null}
        </div>
      </div>
    </div>
  );
}

/** The large photo with its thumbnails, or what an empty gallery means. */
function Photos({
  product,
  images,
}: {
  product: ProductEntity;
  images: ProductImageEntity[];
}) {
  const [selected, setSelected] = useState(0);
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed bg-card px-4 py-10 text-center">
        <ImageOffIcon
          aria-hidden="true"
          className="size-6 text-muted-foreground"
        />
        <p className="font-semibold text-foreground">{o.noPhotos}</p>
        <p className="text-xs text-muted-foreground">{o.noPhotosHint}</p>
      </div>
    );
  }
  const current = images[Math.min(selected, images.length - 1)];
  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto md:flex-col">
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                aria-label={o.photoThumbAria(index + 1)}
                aria-current={index === selected ? "true" : undefined}
                onClick={() => setSelected(index)}
                className={cn(
                  "block size-18 shrink-0 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  index === selected
                    ? "border-primary ring-2 ring-primary/30"
                    : "",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts */}
                <img
                  src={image.url}
                  alt=""
                  className="size-full object-cover"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="aspect-square w-full max-w-md overflow-hidden rounded-lg border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- admin preview off arbitrary upload hosts */}
        <img
          src={current.url}
          alt={current.alt ?? o.photoAlt(product.name, selected + 1)}
          className="size-full object-cover"
        />
      </div>
    </div>
  );
}

/** Price with the old one and the discount, then SKU / brand / category / add-ons. */
function Facts({
  product,
  category,
  canEditCategory,
  addons,
}: {
  product: ProductEntity;
  category: { id: string; name: string };
  canEditCategory: boolean;
  addons: string[];
}) {
  const price = Number(product.price);
  const old = product.compareAtPrice ? Number(product.compareAtPrice) : null;
  const percent =
    old && old > price ? Math.round((1 - price / old) * 100) : null;

  const rows: Array<[string, React.ReactNode]> = [
    [o.sku, product.sku || o.skuMissing],
    [o.brand, product.brand?.name ?? "—"],
    [
      o.category,
      canEditCategory ? (
        <Link
          href={`/categories/${category.id}/edit`}
          className="rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {category.name}
        </Link>
      ) : (
        category.name
      ),
    ],
    [o.addons, addons.length > 0 ? addons.join(", ") : "—"],
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
          {formatCurrency(product.price)}
        </span>
        {old && old > price ? (
          <>
            <span className="text-sm text-muted-foreground tabular-nums line-through">
              {formatCurrency(old)}
            </span>
            {percent ? (
              <span className="rounded-full bg-sale/12 px-2 text-xs font-medium text-sale">
                {o.discount(percent)}
              </span>
            ) : null}
          </>
        ) : null}
      </div>
      <dl className="grid grid-cols-1 gap-x-8 text-sm md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex justify-between gap-4 border-b border-border py-2"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Structured specs, plus any legacy attribute the specs do not already say. */
function Specs({ product }: { product: ProductEntity }) {
  const specs = product.specs ?? [];
  // A legacy attribute repeats a spec when it carries the spec's key («color»)
  // OR its human label («Колір» — group axes are keyed by label).
  const specNames = new Set(
    specs.flatMap((spec) => [spec.key, spec.label].map((n) => n.toLowerCase())),
  );
  const attributes = Object.entries(
    (product.attributes ?? {}) as Record<string, unknown>,
  ).filter(([key]) => !specNames.has(key.toLowerCase()));
  const rows: Array<[string, string]> = [
    ...specs.map(
      (spec) =>
        [spec.label, spec.unit ? `${spec.value} ${spec.unit}` : spec.value] as [
          string,
          string,
        ],
    ),
    ...attributes.map(
      ([key, value]) => [key, String(value)] as [string, string],
    ),
  ];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-base font-semibold text-foreground">{o.specs}</h3>
      {rows.length > 0 ? (
        <dl className="grid grid-cols-1 gap-x-8 text-sm md:grid-cols-2">
          {rows.map(([label, value], index) => (
            <div
              key={`${index}-${label}`}
              className="flex justify-between gap-4 border-b border-border py-2"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{o.specsEmpty}</p>
      )}
    </section>
  );
}
