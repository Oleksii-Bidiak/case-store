"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useProductControllerFindById,
  useProductImageControllerList,
} from "@/entities/product";
import {
  useCategoryControllerGetAdminTree,
  type AdminCategoryTreeNodeEntity,
} from "@/entities/category";
import { useProductGroupControllerFindById } from "@/entities/product-group";
import { useAddonServiceControllerResolveForProduct } from "@/entities/addon-service";
import { ProductDeleteAction } from "@/features/product-delete";
import {
  AdminFormSkeleton,
  Badge,
  RichTextPreview,
  Separator,
} from "@/shared/ui";
import { formatCurrency, formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { ProductHistoryPanel } from "./product-history-panel";

const d = dict.products;

interface AdminProductCardViewProps {
  productId: string;
}

/**
 * Read-only product card, keyed by id (TASK-427).
 *
 * WHY THIS EXISTS ALONGSIDE `/products/preview/[slug]`. That page answers "what
 * will the customer see": it is keyed by SLUG, renders the storefront's view of
 * the position, and is opened in a new tab from the edit form. It cannot answer
 * "what is this product", because half of what an operator needs — the stock
 * split, the SEO overrides, the add-on exceptions, who last touched it — is
 * staff-only and not part of a customer's view. Until now the only way to read
 * those was to open the edit FORM, which is 30 inputs, an unsaved-changes hazard
 * and a permission (`products:write`) a reader should not need.
 *
 * Everything here is one-way rendering. The only writes reachable from this page
 * are the two explicit actions in the header — edit (a link) and delete (behind
 * `products:delete`, with its own confirm).
 *
 * The category NAME comes from the admin category tree — the very query the
 * product form uses, so navigating card ↔ edit costs no extra request. That tree
 * is behind `categories:write`; a manager without it sees «—» for the category
 * and nothing else changes, which is exactly how the product LIST already
 * behaves. The card must not break for a role that may read products.
 */
export function AdminProductCardView({ productId }: AdminProductCardViewProps) {
  const router = useRouter();

  const { data, isLoading, isError, error } =
    useProductControllerFindById(productId);
  const product = data?.data;
  const isNotFound = error?.response?.status === 404;

  const imagesQuery = useProductImageControllerList(productId);
  const addonsQuery = useAddonServiceControllerResolveForProduct(productId);
  const categoriesQuery = useCategoryControllerGetAdminTree();
  const groupQuery = useProductGroupControllerFindById(
    product?.groupId ?? "",
    // A standalone position has no group, and an id-less request would 404 on
    // the server and render as a broken section here.
    { query: { enabled: Boolean(product?.groupId) } },
  );

  if (isLoading) {
    return <AdminFormSkeleton />;
  }

  // A soft-deleted product 404s on every by-id read (the tombstone is excluded),
  // so this is also what the card looks like for a product someone deleted while
  // the operator was looking at the list. Say that, rather than "щось пішло не
  // так" — it is the likeliest cause by far.
  if (isNotFound || (!isError && !product)) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {d.cardBack}
        </Link>
        <p role="alert" className="text-sm text-foreground">
          {d.cardNotFound}
        </p>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {d.cardBack}
        </Link>
        <p role="alert" className="text-sm text-destructive">
          {d.cardLoadError}
        </p>
      </div>
    );
  }

  const images = imagesQuery.data?.data ?? [];
  const addons = addonsQuery.data?.data ?? [];
  const attributes = product.attributes ?? {};
  const specs = product.specs ?? [];
  const compat = product.compatibleDeviceModels ?? [];
  const categoryName =
    findCategoryName(categoriesQuery.data?.data ?? [], product.categoryId) ??
    d.cardEmptyValue;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {d.cardBack}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href={`/products/${productId}/edit`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {d.cardEditLink}
          </Link>
          <Link
            href={`/products/preview/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            {d.previewLink}
          </Link>
          <ProductDeleteAction
            productId={productId}
            name={product.name}
            onDeleted={() => router.replace("/products")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {product.name}
          </h2>
          <Badge variant={product.isActive ? "default" : "secondary"}>
            {product.isActive ? d.previewActive : d.previewInactive}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">/{product.slug}</p>
      </div>

      {/* ── Основне ─────────────────────────────────────────────────────── */}
      <Section title={d.cardSectionMain}>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Field label={d.cardFieldPrice}>
            {formatCurrency(product.price)}
          </Field>
          <Field label={d.cardFieldCompareAt}>
            {product.compareAtPrice
              ? formatCurrency(product.compareAtPrice)
              : d.cardEmptyValue}
          </Field>
          <Field label={d.previewSku}>{product.sku || d.cardEmptyValue}</Field>
          <Field label={d.previewCategory}>{categoryName}</Field>
          <Field label={d.cardFieldBrand}>
            {product.brand?.name ?? d.cardEmptyValue}
          </Field>
          <Field label={d.cardFieldGroup}>
            {product.groupId
              ? (groupQuery.data?.data?.name ?? d.cardEmptyValue)
              : d.cardEmptyValue}
          </Field>
          <Field label={d.cardFieldPosition}>{product.positionOrder}</Field>
          <Field label={d.cardFieldSlug}>{product.slug}</Field>
          <Field label={d.cardFieldCreated}>
            {formatDateTime(product.createdAt)}
          </Field>
          <Field label={d.cardFieldUpdated}>
            {formatDateTime(product.updatedAt)}
          </Field>
        </dl>
      </Section>

      {/* ── Залишки ─────────────────────────────────────────────────────── */}
      <Section title={d.cardSectionStock} hint={d.colStockHint}>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          <Field label={d.previewStock}>{product.stock}</Field>
          <Field label={d.previewReserved}>{product.reservedQty}</Field>
          <Field label={d.previewPhysical}>{product.physicalQty}</Field>
        </dl>
      </Section>

      {/* ── Зображення ──────────────────────────────────────────────────── */}
      <Section title={d.cardSectionImages}>
        {images.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              {d.cardImageCount(images.length)}
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="size-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts; next/image would need every one allowlisted */}
                  <img
                    src={image.url}
                    alt={image.alt ?? product.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{d.previewNoImages}</p>
        )}
      </Section>

      {/* ── Опис ────────────────────────────────────────────────────────── */}
      <Section title={d.cardSectionDescription}>
        <RichTextPreview
          html={product.description ?? ""}
          emptyLabel={d.previewNoDescription}
        />
      </Section>

      {/* ── Атрибути позиції ────────────────────────────────────────────── */}
      {Object.keys(attributes).length > 0 && (
        <Section title={d.previewAttributes}>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {Object.entries(attributes).map(([key, value]) => (
              <Field key={key} label={key}>
                {String(value ?? "")}
              </Field>
            ))}
          </dl>
        </Section>
      )}

      {/* ── Характеристики ──────────────────────────────────────────────── */}
      <Section title={d.cardSectionSpecs}>
        {specs.length > 0 ? (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {specs.map((spec) => (
              <Field key={spec.key} label={spec.label}>
                {spec.unit ? `${spec.value} ${spec.unit}` : spec.value}
              </Field>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">{d.cardNoSpecs}</p>
        )}
      </Section>

      {/* ── Додаткові послуги ───────────────────────────────────────────── */}
      <Section title={d.cardSectionAddons}>
        {addons.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {addons.map((addon) => (
              <li
                key={addon.addonServiceId}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-1.5"
              >
                <span className="flex items-center gap-2 text-foreground">
                  {addon.name}
                  <Badge
                    variant={
                      addon.source === "template" ? "outline" : "secondary"
                    }
                  >
                    {addon.source === "add"
                      ? d.addonDeltas.badgeExclusive
                      : addon.source === "override"
                        ? d.addonDeltas.badgeOverridden
                        : d.addonDeltas.badgeTemplate}
                  </Badge>
                </span>
                <span className="font-medium text-foreground">
                  {formatCurrency(addon.price)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{d.cardNoAddons}</p>
        )}
      </Section>

      {/* ── Сумісні пристрої ────────────────────────────────────────────── */}
      <Section title={d.cardSectionCompat}>
        {compat.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {compat.map((device) => (
              <li key={device.id}>
                <Badge variant="outline">
                  {device.brandName} {device.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{d.cardNoCompat}</p>
        )}
      </Section>

      {/* ── SEO ─────────────────────────────────────────────────────────── */}
      <Section title={d.cardSectionSeo} hint={d.cardSeoFallback}>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm">
          <Field label={d.cardFieldMetaTitle}>
            {product.metaTitle || d.cardEmptyValue}
          </Field>
          <Field label={d.cardFieldMetaDescription}>
            {product.metaDescription || d.cardEmptyValue}
          </Field>
        </dl>
      </Section>

      {/* ── Історія змін ────────────────────────────────────────────────── */}
      <Section title={d.cardSectionHistory}>
        <ProductHistoryPanel productId={productId} />
      </Section>
    </div>
  );
}

/** One titled block of the card, with the page's single section rhythm. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <Separator />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** A label/value pair inside a card `<dl>`. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

/** Depth-first lookup of a category name in the admin tree. */
function findCategoryName(
  nodes: AdminCategoryTreeNodeEntity[],
  categoryId: string,
): string | null {
  for (const node of nodes) {
    if (node.id === categoryId) {
      return node.name;
    }
    const found = findCategoryName(node.children ?? [], categoryId);
    if (found) {
      return found;
    }
  }
  return null;
}
