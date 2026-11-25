/**
 * Shared seed types. Authored data in `seed/data/` is typed against these and
 * the `seed/seeders/` consume them. Moved verbatim out of the former
 * single-file `prisma/seed.ts` (plan 170, TASK-363) and reshaped for the
 * Ukrainian catalogue (TASK-366).
 */
import type { OrderHistoryNote, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import type { NpCityKey } from './data/delivery.data';

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
   * Internal content tags (TASK-437) — the words a shopper might type that the
   * name and description do not contain. NOT a `<meta name="keywords">` tag:
   * nothing renders them into `<head>`. Seeded on a handful of demo entries so
   * the admin field is not an empty box on the stand.
   */
  keywords?: string[];
  /**
   * Demo flag (TASK-437): give this entry an `ogImage` distinct from its cover,
   * taken from the LAST image the seed renders for the position. The seed never
   * invents an image URL — this points at a file it has just written — and the
   * point of the demo is exactly that the link card can differ from the
   * catalogue cover.
   */
  demoOgImage?: boolean;
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

export type { OrderStatus, PaymentStatus };

/**
 * How a seeded order travels (TASK-2563). Each variant carries what checkout
 * would have been given for that method — a Nova Poshta city and branch, an
 * active pickup point (by its seed key), a street for the courier, free text
 * for «Інша доставка».
 */
export type DeliverySpec =
  | { method: 'NOVA_POSHTA'; city: NpCityKey; branch: 0 | 1 }
  | { method: 'PICKUP'; point: string }
  | { method: 'COURIER'; street: string }
  | { method: 'OTHER'; city: string; street: string };

/** Who did a thing, symbolically; the seeder maps it to an account id. */
export type SeedActor = 'system' | 'customer' | 'operator' | 'owner';

/**
 * One money event on an order, in the order it happened. `at` is hours after
 * the order was placed. Amounts are UAH; an omitted amount means "what is owed"
 * for a receipt and "everything still held" for a payout.
 */
export type MoneyEventSpec =
  | { type: 'liqpay'; outcome: 'SUCCEEDED' | 'FAILED'; at: number }
  | {
      type: 'receipt';
      kind: 'COD_NOVA_POSHTA' | 'PAID_AT_POINT' | 'PAID_TO_COURIER' | 'BANK_TRANSFER';
      amount?: number;
      at: number;
      reason?: string;
    }
  | {
      type: 'payout';
      kind: 'CASH_REFUND' | 'TRANSFER_REFUND';
      amount?: number;
      at: number;
      reason: string;
    }
  /** Сторно of the money event at index `of` of the same list. */
  | { type: 'reversal'; of: number; at: number; reason: string }
  /**
   * «Залік» (TASK-2048): one half of the pair «Створити копію» writes — OUT of
   * a cancelled original (`OFFSET_TO_ORDER`), IN to its copy
   * (`OFFSET_FROM_ORDER`) — naming the other order by its seed key.
   */
  | {
      type: 'offset';
      kind: 'OFFSET_TO_ORDER' | 'OFFSET_FROM_ORDER';
      counterpart: string;
      amountKop: number;
      at: number;
      actor: SeedActor;
    };

export interface OrderSpec {
  key: string;
  /** The buyer's account. Absent on a guest order. */
  email?: string;
  /** A guest checkout — no account, the contact typed at checkout (TASK-338). */
  guest?: { firstName: string; lastName: string; email: string; phone: string };
  /** Taken by an operator in the admin panel — the only door to BANK_TRANSFER. */
  byOperator?: boolean;
  /** Where the order stands once the orders seeder is done. */
  status: OrderStatus;
  /** The payment status the money events derive — checked against the domain, never written blindly. */
  paymentStatus: PaymentStatus;
  /** Every status the order passed through, PENDING first. */
  statusFlow: OrderStatus[];
  /** Hours after placement at which a status was reached (default: `statusOffsetHours`). */
  statusAt?: Partial<Record<OrderStatus, number>>;
  /** Statuses the shop set by itself (LiqPay → CONFIRMED, an expired reservation → CANCELLED). */
  systemStatuses?: OrderStatus[];
  /** Who moved the order into a status, where it is not the default (see `statusActor`). */
  statusActors?: Partial<Record<OrderStatus, SeedActor>>;
  /** A history note on the row INTO a status (PENDING = the creation row). */
  statusNotes?: Partial<Record<OrderStatus, OrderHistoryNote>>;
  /** `current → current` STATUS rows that only carry a note (a copy made without a cancel). */
  markers?: { at: number; note: OrderHistoryNote; actor: SeedActor }[];
  /** Seed key of the order this one is a copy of (TASK-2048). */
  copiedFrom?: string;
  paymentMethod: PaymentMethod;
  delivery: DeliverySpec;
  /** `addons` are AddonService names bought with the line. */
  items: { sku: string; quantity: number; addons?: string[] }[];
  discountCode?: string;
  /** The buyer's comment at checkout. */
  notes?: string;
  /** The operator's note on the order card. */
  internalNotes?: string;
  trackingNumber?: string;
  daysAgo: number;
  selfCancel?: boolean;
  money?: MoneyEventSpec[];
  /**
   * The returns seeder turns this order REFUNDED (its returns cover every line),
   * so it is not a purchase its buyer endorses with a review.
   */
  refundedByReturns?: boolean;
}
