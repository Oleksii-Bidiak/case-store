"use client";

import { useState } from "react";
import {
  useCarouselControllerFindAll,
  type CarouselEntity,
  type CarouselItemEntity,
} from "@/entities/carousel";
import type { CarouselSourceValue } from "@/features/carousel-form";
import {
  CarouselItemPicker,
  type CarouselPickedItem,
} from "@/features/carousel-item-picker";
import { formatCurrency } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";
import { FormSectionCard } from "@/shared/ui/form-section-card";
import { dict } from "@/shared/config";

const c = dict.carouselItems;
const f = dict.carouselForm;

/** How many product cards «Зараз на сайті» draws before «+N». */
const PREVIEW_CARDS = 6;

/** The saved item list in the picker's shape. */
export function toPickedItems(
  items: readonly CarouselItemEntity[],
): CarouselPickedItem[] {
  return items.map((item) => ({
    productId: item.productId,
    name: item.product.name,
    imageUrl: item.product.imageUrl,
    price: item.product.price,
    isActive: item.product.isActive,
  }));
}

/** Same products in the same order — nothing to write. */
export function sameItemOrder(
  a: readonly CarouselPickedItem[],
  b: readonly CarouselPickedItem[],
): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => item.productId === b[index].productId)
  );
}

/** The `PUT /admin/carousels/:id/items` body — positions are the indexes. */
export function itemsPayload(items: readonly CarouselPickedItem[]) {
  return {
    items: items.map((item, index) => ({
      productId: item.productId,
      sortOrder: index,
    })),
  };
}

/** «Вибрані вручну»: the picker over the host's list, or its loading state. */
export function ManualItemsPanel({
  items,
  onChange,
  isLoading = false,
  isError = false,
}: {
  items: readonly CarouselPickedItem[];
  onChange: (next: CarouselPickedItem[]) => void;
  isLoading?: boolean;
  isError?: boolean;
}) {
  if (isLoading) {
    return (
      <FormSectionCard title={c.heading}>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </FormSectionCard>
    );
  }
  if (isError) {
    return (
      <FormSectionCard title={c.heading}>
        <p role="alert" className="text-sm text-destructive">
          {c.loadError}
        </p>
      </FormSectionCard>
    );
  }
  return <CarouselItemPicker items={items} onChange={onChange} />;
}

/**
 * An automatic source (КР7): «Зараз на сайті» — the products the site shows
 * for this carousel right now, read from the PUBLIC carousel list. That list
 * holds only PUBLISHED carousels and only their SAVED settings, so the preview
 * is drawn only while the source on screen is the saved one; otherwise — a
 * draft, a new carousel, another source picked — the panel explains that the
 * site fills it by itself (AD-CNT-25). A preview of an unsaved source would
 * need an API that resolves a source without saving it (an API tail).
 */
export function AutoSourcePanel({
  source,
  saved,
}: {
  source: CarouselSourceValue;
  saved?: CarouselEntity;
}) {
  const canPreview =
    saved !== undefined &&
    saved.status === "PUBLISHED" &&
    saved.source === source;
  const live = useCarouselControllerFindAll(
    saved ? { placement: saved.placement } : undefined,
    { query: { enabled: canPreview } },
  );
  const current = canPreview
    ? live.data?.data.find((carousel) => carousel.id === saved.id)
    : undefined;

  if (!current) return <AutoSourceItemsNotice source={source} />;

  const shown = current.products.slice(0, PREVIEW_CARDS);
  const more = current.products.length - shown.length;
  return (
    <FormSectionCard title={f.livePreview(current.products.length)}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {shown.map((product) => (
          <li key={product.id} className="flex min-w-0 flex-col gap-1">
            <PreviewImage url={product.primaryImage?.url} />
            <span className="line-clamp-2 text-xs text-foreground">
              {product.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatCurrency(product.price)}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <p className="text-xs text-muted-foreground">{`+${more}`}</p>
      )}
      <p className="text-xs text-muted-foreground">{c.autoSwitchHint}</p>
    </FormSectionCard>
  );
}

function PreviewImage({ url }: { url?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span
        aria-hidden="true"
        className="aspect-square w-full rounded-md border border-dashed border-border bg-muted/50"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin preview of a stored product image URL
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-square w-full rounded-md bg-muted object-cover"
    />
  );
}

/**
 * What stands where the item list would be for an automatic source with no
 * live preview (AD-CNT-25, TASK-429). Until then this slot rendered nothing and
 * operators reported reordering as broken; it now says who is in charge and
 * the one action that brings the list.
 */
function AutoSourceItemsNotice({ source }: { source: CarouselSourceValue }) {
  return (
    <section
      aria-label={c.heading}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/20 p-4"
    >
      <h3 className="text-sm font-semibold text-foreground">{c.autoHeading}</h3>
      <p className="text-sm text-muted-foreground">
        {c.autoHint(f.sourceOptions[source])}
      </p>
      <p className="text-sm text-muted-foreground">{c.autoSwitchHint}</p>
    </section>
  );
}
