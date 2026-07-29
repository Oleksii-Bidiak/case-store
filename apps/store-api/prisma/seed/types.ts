/**
 * Shared seed types. Authored data in `seed/data/` is typed against these and
 * the `seed/seeders/` consume them. Moved verbatim out of the former
 * single-file `prisma/seed.ts` (plan 170, TASK-363) and reshaped for the
 * Ukrainian catalogue (TASK-366).
 */

export interface SeededUser {
  id: string;
  email: string;
}

export interface VariantSeed {
  /** Ukrainian label of the position inside its group, e.g. «Чорний». */
  name: string;
  /**
   * Latin token appended to the entry slug to form the position slug
   * (`${entry.slug}-${slugPart}`). REQUIRED on multi-variant entries: Ukrainian
   * variant names slugify to the empty string, and the old SKU fallback made
   * position URLs unreadable (`iphone-15-pro-ip15pro-128-nt`).
   */
  slugPart?: string;
  sku?: string;
  price: number;
  stock: number;
  /** Axis name (Ukrainian, e.g. «Колір») → value. Empty for standalone entries. */
  attributes: Record<string, string>;
}

export interface ImageSeed {
  alt: string;
  sortOrder: number;
}

/**
 * One catalogue entry as authored in `data/catalogue/**`. Carries a category
 * SLUG rather than an id so the array is a plain module-level constant: the
 * orders / device-compat / attribute / addon seeders all read it directly
 * without a database round-trip or a category map.
 */
export interface CatalogueEntry {
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  categorySlug: string;
  /** Manufacturer brand slug (TASK-189) — resolved to `brandId` via the map. */
  brandSlug?: string;
  metaTitle?: string;
  metaDescription?: string;
  /**
   * Structured spec values (TASK-191) keyed by `AttributeDefinition.key`. The
   * definitions themselves live in `data/attributes.data.ts`, declared on the
   * ROOT category and inherited down the subtree at read time.
   */
  specs?: Record<string, string | number | boolean>;
  /** Gallery view labels; each becomes one image alt «{name} — {view}». */
  views?: string[];
  variants: VariantSeed[];
}

/** A catalogue entry with its category id resolved — what `seedProducts` consumes. */
export interface ProductSeed extends CatalogueEntry {
  categoryId: string;
  images: ImageSeed[];
}

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface OrderSpec {
  key: string;
  email: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  statusFlow: OrderStatus[];
  paymentFlow: PaymentStatus[];
  items: { sku: string; quantity: number }[];
  discountCode?: string;
  notes?: string;
  daysAgo: number;
  city: string;
  warehouse: string;
  selfCancel?: boolean;
}
