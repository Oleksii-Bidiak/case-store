import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import type { PublicOrderRow } from './entities/public-order.entity';

/**
 * Hard cap on how many orders one lookup may return (TASK-483).
 *
 * Several matches are legitimate — an 8-character UUID prefix can collide, and
 * a matching phone means they all belong to the same person, so showing the list
 * is not a leak (B-5 §1). The cap is here because "several" must never become
 * "every order in the shop" if the query is ever loosened by a later edit.
 */
const MAX_LOOKUP_RESULTS = 10;

const HEX = '0123456789abcdef';

/**
 * The `id` range `[prefix, successor)` that holds exactly the ids starting with
 * an order number (TASK-625).
 *
 * `id: { startsWith }` compiles to `id LIKE 'prefix%'`, and under the database's
 * default collation (`en_US.utf8`, not `C`) a btree cannot serve a LIKE — so the
 * one public, uncached route that reads the primary database seq-scanned
 * `orders` on every request. A plain range on the primary key can walk its
 * index. (`text_pattern_ops` would also do, but Prisma cannot declare it, so it
 * would live as drift outside the schema.)
 *
 * The successor is computed IN THE HEX ALPHABET, not by char code: `9` + 1 is
 * `:`, which a linguistic collation sorts as ignorable punctuation — the range
 * would come out empty. The number is always exactly 8 lower-case hex
 * characters (the service rejects anything else), and a UUID's first 8
 * characters are always hex, so no id outside the prefix can fall inside the
 * range. `ffffffff` has no successor and gets an open upper end.
 */
export function orderNumberIdRange(prefix: string): { gte: string; lt?: string } {
  const digits = prefix.split('');
  for (let i = digits.length - 1; i >= 0; i--) {
    const next = HEX.indexOf(digits[i]) + 1;
    if (next < HEX.length) {
      digits[i] = HEX[next];
      return { gte: prefix, lt: digits.join('') };
    }
    digits[i] = HEX[0];
  }
  return { gte: prefix };
}

/**
 * OrderLookupRepository — the one query behind the public "check my order" form
 * (TASK-483).
 *
 * ── Why this is its own repository ────────────────────────────────────────────
 * `OrderRepository` returns whole orders: `ORDERS_INCLUDE` pulls the user row,
 * the guest contact block, internal notes and both address snapshots, because
 * every other caller is either the buyer's own session or an operator. This
 * query must return LESS than that, permanently, and the cheapest way to
 * guarantee that is a file whose only `select` is the narrow one. A public
 * projection assembled by discarding fields from a wide read is a projection
 * that silently widens the next time somebody adds an `include`.
 *
 * (It is also what keeps this wave's parallel agents out of each other's way —
 * `order.repository.ts` is being edited elsewhere — but the design reason above
 * is the one that outlives the wave.)
 */
@Injectable()
export class OrderLookupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find the order(s) matching an EXACT 8-character id prefix and a phone.
   *
   * ── The prefix is exact, not "starts with whatever was typed" ─────────────
   * The id is matched as a prefix RANGE (see {@link orderNumberIdRange}), and the prefix is always
   * exactly `ORDER_NUMBER_LENGTH` (8) characters — the service refuses anything
   * that is not, before this method is reached. That distinction is the
   * whole security property: a 3-character term would match hundreds of
   * unrelated orders, and since the phone of one of them is all an attacker
   * needs, a short prefix turns this form into a way to browse the shop's order
   * book (B-5 §1).
   *
   * ── The phone is compared for EQUALITY ────────────────────────────────────
   * Not `contains`. Since TASK-466 both the column and the query term are the
   * same canonical `380XXXXXXXXX`, so equality is exact and index-friendly —
   * and, unlike `contains`, a short or partial number cannot match a stranger's.
   * Account orders are matched through `user.phone` for the same reason the
   * admin search does: since guest checkout, half the orders keep the customer
   * on the ORDER and half on the USER, and looking at only one of them makes the
   * form fail for the customers who did nothing wrong.
   *
   * Soft-deleted orders are excluded, which is why a deleted order and an
   * unknown one are indistinguishable from outside.
   */
  findByNumberAndPhone(numberPrefix: string, phone: string): Promise<PublicOrderRow[]> {
    return this.prisma.order.findMany({
      where: {
        deletedAt: null,
        // A range, not startsWith: see orderNumberIdRange (TASK-625).
        id: orderNumberIdRange(numberPrefix),
        OR: [{ guestPhone: phone }, { user: { phone } }],
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        subtotal: true,
        discount: true,
        shippingCost: true,
        addonsTotal: true,
        total: true,
        trackingNumber: true,
        // The whole JSON column: the projection reads `city` and
        // `npWarehouseName` out of it and never renders the rest. Prisma cannot
        // select INTO a Json column, so the narrowing happens in
        // `PublicOrderEntity.fromRow` — which is exactly why that class exists
        // and why it has no `address1` field to put a street in.
        shippingAddress: true,
        items: {
          select: {
            quantity: true,
            price: true,
            product: { select: { name: true } },
            addons: { select: { name: true, price: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_LOOKUP_RESULTS,
    }) as unknown as Promise<PublicOrderRow[]>;
  }
}
