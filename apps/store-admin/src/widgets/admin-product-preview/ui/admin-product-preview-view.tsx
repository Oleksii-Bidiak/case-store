"use client";

import Link from "next/link";
import {
  useProductControllerPreviewProductBySlug,
  type ProductSiblingEntity,
} from "@/entities/product";
import { AdminFormSkeleton, Badge, Separator } from "@/shared/ui";
import { formatCurrency } from "@/shared/lib/format";
import { dict } from "@/shared/config";

interface AdminProductPreviewViewProps {
  slug: string;
}

/**
 * Read-only staff preview of a single product by slug, INCLUDING deactivated
 * products (TASK-155). Fetches via the admin-guarded preview endpoint, so it
 * surfaces the same rich detail a customer would see plus staff-only context
 * (the "deactivated" banner and an Edit shortcut).
 *
 * Note: group siblings are limited to active positions — the backend's
 * `findBySlugWithRelations` filters sibling positions to `isActive: true`, so
 * inactive siblings do not appear here even in the admin preview. Surfacing them
 * is a deliberate out-of-scope follow-up.
 */
export function AdminProductPreviewView({
  slug,
}: AdminProductPreviewViewProps) {
  const { data, isLoading, isError } =
    useProductControllerPreviewProductBySlug(slug);

  if (isLoading) {
    return <AdminFormSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.products.previewBack}
        </Link>
        <p role="alert" className="text-sm text-destructive">
          {dict.products.previewLoadError}
        </p>
      </div>
    );
  }

  const { data: product, category, group, images } = data;
  const attributes = product.attributes ?? {};

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/products"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {dict.products.previewBack}
        </Link>
        <Link
          href={`/products/${product.id}/edit`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {dict.products.previewEditLink}
        </Link>
      </div>

      {!product.isActive && (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {dict.products.previewDeactivatedBanner}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground">{product.name}</h2>
          <Badge variant={product.isActive ? "default" : "secondary"}>
            {product.isActive
              ? dict.products.previewActive
              : dict.products.previewInactive}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">/{product.slug}</p>
      </div>

      {/* Image strip */}
      {images.length > 0 ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {images.map((image, index) => (
            <div
              key={image.id}
              className={
                index === 0
                  ? "h-48 w-48 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                  : "h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.alt ?? product.name}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {dict.products.previewNoImages}
        </p>
      )}

      {/* Price */}
      <div className="flex items-baseline gap-3">
        <span className="text-xl font-semibold text-foreground">
          {formatCurrency(product.price)}
        </span>
        {product.compareAtPrice && (
          <span className="text-sm text-muted-foreground line-through">
            {formatCurrency(product.compareAtPrice)}
          </span>
        )}
      </div>

      {/* Meta grid */}
      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4 border-b border-border py-1.5">
          <dt className="text-muted-foreground">
            {dict.products.previewCategory}
          </dt>
          <dd className="font-medium text-foreground">{category.name}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-border py-1.5">
          <dt className="text-muted-foreground">
            {dict.products.previewStock}
          </dt>
          <dd className="font-medium text-foreground">{product.stock}</dd>
        </div>
        {product.sku && (
          <div className="flex justify-between gap-4 border-b border-border py-1.5">
            <dt className="text-muted-foreground">
              {dict.products.previewSku}
            </dt>
            <dd className="font-medium text-foreground">{product.sku}</dd>
          </div>
        )}
      </dl>

      {/* Attributes */}
      {Object.keys(attributes).length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-foreground">
            {dict.products.previewAttributes}
          </h3>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {Object.entries(attributes).map(([key, value]) => (
              <div
                key={key}
                className="flex justify-between gap-4 border-b border-border py-1.5"
              >
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="font-medium text-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Description — product descriptions are plain text (textarea), not HTML */}
      <section className="flex flex-col gap-2">
        <Separator />
        {product.description ? (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {product.description}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {dict.products.previewNoDescription}
          </p>
        )}
      </section>

      {/* Group siblings */}
      {group && group.positions.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold text-foreground">
            {dict.products.previewSiblings}
          </h3>
          <ul className="flex flex-col gap-1">
            {group.positions.map((sibling: ProductSiblingEntity) => (
              <li key={sibling.id}>
                {sibling.slug === product.slug ? (
                  <span className="flex justify-between gap-4 rounded bg-muted px-3 py-1.5 text-sm font-medium text-foreground">
                    <span>{sibling.name}</span>
                    <span>{formatCurrency(sibling.price)}</span>
                  </span>
                ) : (
                  <Link
                    href={`/products/preview/${sibling.slug}`}
                    className="flex justify-between gap-4 rounded px-3 py-1.5 text-sm text-foreground hover:bg-muted"
                  >
                    <span>{sibling.name}</span>
                    <span>{formatCurrency(sibling.price)}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
