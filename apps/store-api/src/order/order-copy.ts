import type { OrderStatus } from '@prisma/client';
import { isCategoryOnSale } from '../product';
import { PRE_SHIPMENT_STATUSES } from './order.constants';

/**
 * «Створити копію» (TASK-2048) — the pure half: which lines of the original the
 * copy form starts with, and which the operator is warned about.
 *
 * A copy is a NEW sale, so every line is priced from the catalogue as it is
 * today (never the original's frozen price) and re-checked against what can be
 * sold now: a withdrawn or deleted product is dropped, a short one is clamped.
 * No NestJS, no Prisma client — the repository reads, this decides.
 */

/** One line of the original, with its product as the catalogue has it NOW. */
export interface CopySourceLine {
  productId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    sku: string | null;
    price: { toString(): string };
    stock: number;
    isActive: boolean;
    deletedAt: Date | null;
    category: { isActive: boolean; ancestorsActive: boolean };
  };
}

/** A line the copy form starts with. */
export interface CopyDraftLine {
  productId: string;
  productName: string;
  sku: string | null;
  /** Today's catalogue price — display only, the server prices the order again. */
  price: string;
  quantity: number;
  /** What the copy may take: the shelf plus what the original's cancel releases. */
  stock: number;
}

/** Why a line did not make it into the copy whole. */
export type CopyDropReason = 'DELETED' | 'INACTIVE' | 'OUT_OF_STOCK' | 'CLAMPED';

/** A line the operator is warned about: dropped (`copied: 0`) or clamped. */
export interface CopyDroppedLine {
  productId: string;
  productName: string;
  requested: number;
  copied: number;
  reason: CopyDropReason;
}

/**
 * The copy's starting lines. `released` is what cancelling the original gives
 * back per product ({@link releasesStockOnCopy}) — counted as available, since
 * the cancel runs before the copy reserves. Two lines of one product share its
 * stock, in order.
 */
export function planCopyLines(
  source: ReadonlyArray<CopySourceLine>,
  options: { released: ReadonlyMap<string, number> },
): { lines: CopyDraftLine[]; dropped: CopyDroppedLine[] } {
  const lines: CopyDraftLine[] = [];
  const dropped: CopyDroppedLine[] = [];
  const left = new Map<string, number>();

  for (const item of source) {
    const { product } = item;
    const drop = (reason: CopyDropReason, copied = 0) =>
      dropped.push({
        productId: item.productId,
        productName: product.name,
        requested: item.quantity,
        copied,
        reason,
      });

    if (product.deletedAt !== null) {
      drop('DELETED');
      continue;
    }
    if (!product.isActive || !isCategoryOnSale(product.category)) {
      drop('INACTIVE');
      continue;
    }

    const available =
      left.get(item.productId) ??
      Math.max(0, product.stock) + (options.released.get(item.productId) ?? 0);
    const quantity = Math.min(item.quantity, available);
    left.set(item.productId, available - quantity);
    if (quantity <= 0) {
      drop('OUT_OF_STOCK');
      continue;
    }
    if (quantity < item.quantity) {
      drop('CLAMPED', quantity);
    }
    lines.push({
      productId: item.productId,
      productName: product.name,
      sku: product.sku,
      price: product.price.toString(),
      quantity,
      stock: available,
    });
  }

  return { lines, dropped };
}

/**
 * Whether cancelling the original as part of the copy gives its units back to
 * the shelf: only a pre-shipment order still holding its reservation does (a
 * hold the reconcile worker already released, TASK-627, holds nothing).
 */
export function releasesStockOnCopy(
  source: { status: OrderStatus; restockedAt: Date | null },
  cancelOriginal: boolean,
): boolean {
  return cancelOriginal && PRE_SHIPMENT_STATUSES.has(source.status) && source.restockedAt === null;
}

/** Units per product an original gives back when it is cancelled. */
export function releasedQuantities(
  items: ReadonlyArray<{ productId: string; quantity: number }>,
): Map<string, number> {
  const released = new Map<string, number>();
  for (const item of items) {
    released.set(item.productId, (released.get(item.productId) ?? 0) + item.quantity);
  }
  return released;
}
