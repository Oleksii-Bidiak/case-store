/**
 * Shared seed types. Authored data in `seed/data/` is typed against these and
 * the `seed/seeders/` consume them. Moved verbatim out of the former
 * single-file `prisma/seed.ts` (plan 170, TASK-363).
 */

export interface SeededUser {
  id: string;
  email: string;
}

export interface VariantSeed {
  name: string;
  sku?: string;
  price: number;
  stock: number;
  attributes: Record<string, string>;
}

export interface ImageSeed {
  url: string;
  alt: string;
  sortOrder: number;
}

export interface ProductSeed {
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  sku: string;
  categoryId: string;
  /** Manufacturer brand slug (TASK-189) — resolved to `brandId` via the map. */
  brandSlug?: string;
  metaTitle?: string;
  metaDescription?: string;
  variants: VariantSeed[];
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
