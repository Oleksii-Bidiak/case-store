import { OrderStatus } from '@prisma/client';

/**
 * The order state machine (TASK-332, plan 163).
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * Until now `PATCH /api/admin/orders/:id/status` wrote whatever status it was
 * handed. Its own docblock admitted it ("transition sensibility is enforced in
 * the admin UI"), which is another way of saying it was not enforced at all: the
 * UI offered every status except the current one, and nothing on the server
 * disagreed. That was survivable while a human was the only writer. It stops
 * being survivable the moment a payment callback also writes — an out-of-order
 * or duplicated provider notification would either overwrite a status the
 * operator had just set, or drag a delivered order back into "pending".
 *
 * So the allowed moves live HERE, in one pure table, and every writer — the
 * admin endpoint, the payment callback, the reconcile worker — asks the same
 * question of the same table. Pure on purpose: no NestJS, no Prisma, no clock.
 * The rules are the part most likely to be argued about and edited, so they are
 * the part that must be testable without a database.
 *
 * ── The shape of the graph ──────────────────────────────────────────────────
 *
 *   PENDING ─→ CONFIRMED ─→ PROCESSING ─→ SHIPPED ─→ DELIVERED
 *      └───────────┴─────────────┴───────────┴──────────┘
 *                            ↓ (any)
 *                        CANCELLED ⇄ REFUNDED
 *                            │            ↑
 *                            └─ revive ─┐ │
 *                    (PENDING/CONFIRMED/PROCESSING)
 *
 * Four rules produce it:
 *
 *  1. **Forward only, but skipping is fine.** A shop that packs and ships within
 *     the hour should not have to click through four states to record the truth,
 *     so PENDING → SHIPPED is legal. Going backwards is not: it would rewrite
 *     history the customer has already been emailed about.
 *  2. **Cancel from anywhere.** A parcel can be refused at the counter, so even
 *     DELIVERED → CANCELLED is allowed. What differs by source status is whether
 *     stock comes back automatically — that decision belongs to
 *     `shouldAutoRestock` in the service, not here.
 *  3. **Refund only after the goods or the money moved.** SHIPPED, DELIVERED and
 *     CANCELLED may become REFUNDED. A PENDING order has nothing to refund; the
 *     honest action there is to cancel it.
 *  4. **Revive lands in the queue, never in transit.** A mistaken cancellation is
 *     undone into PENDING/CONFIRMED/PROCESSING — the statuses whose stock the
 *     revive path re-reserves. CANCELLED → SHIPPED is refused because it would
 *     assert a parcel left the building in the same breath as re-reserving the
 *     stock it supposedly contains; the operator revives, then advances.
 *
 * A status is never its own successor. Writing PENDING over PENDING changes
 * nothing but appends an OrderStatusHistory row, which is precisely the "polluted
 * history" this task exists to stop.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> =
  Object.freeze({
    [OrderStatus.PENDING]: Object.freeze([
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ]),
    [OrderStatus.CONFIRMED]: Object.freeze([
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ]),
    [OrderStatus.PROCESSING]: Object.freeze([
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ]),
    [OrderStatus.SHIPPED]: Object.freeze([
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
      OrderStatus.REFUNDED,
    ]),
    [OrderStatus.DELIVERED]: Object.freeze([OrderStatus.CANCELLED, OrderStatus.REFUNDED]),
    // Revive targets are exactly the pre-shipment statuses — see rule 4 above.
    [OrderStatus.CANCELLED]: Object.freeze([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.REFUNDED,
    ]),
    // Terminal but for its twin: the two terminal statuses may be corrected into
    // one another (the service's revive branch already treats CANCELLED ⇄ REFUNDED
    // as a stock-neutral move). Nothing else leaves REFUNDED — the money is back
    // with the customer, and a "refunded" order returning to PROCESSING is a
    // bookkeeping fiction.
    [OrderStatus.REFUNDED]: Object.freeze([OrderStatus.CANCELLED]),
  });

/**
 * Statuses from which no further progress is expected. Used for reporting and to
 * keep the admin UI honest about which orders are still work.
 */
const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
]);

/**
 * Whether an order may move from `from` to `to`.
 *
 * The single question every writer asks. `false` for a same-status "transition"
 * — see the table's docblock.
 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/**
 * Every status reachable from `from`, as a fresh (caller-owned) array.
 *
 * Backs `GET /api/admin/orders/:orderId/allowed-transitions`, so the admin panel
 * can offer exactly the valid targets instead of "everything except the current
 * status" and then discovering the truth via a 409.
 */
export function allowedTransitions(from: OrderStatus): OrderStatus[] {
  return [...ORDER_TRANSITIONS[from]];
}

/** Whether the status is one an order is expected to rest in (CANCELLED/REFUNDED). */
export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
