import { OrderStatus } from '@prisma/client';
import {
  ORDER_TRANSITIONS,
  allowedTransitions,
  canTransition,
  isTerminalStatus,
} from './order-state-machine';

const ALL_STATUSES = Object.values(OrderStatus);

describe('order-state-machine (TASK-332)', () => {
  // ─── Table shape ────────────────────────────────────────────────────────────

  describe('ORDER_TRANSITIONS', () => {
    it('declares an entry for every OrderStatus (no status can fall off the map)', () => {
      for (const status of ALL_STATUSES) {
        expect(ORDER_TRANSITIONS[status]).toBeDefined();
      }
      expect(Object.keys(ORDER_TRANSITIONS).sort()).toEqual([...ALL_STATUSES].sort());
    });

    it('never lists a status as its own successor (a no-op write is not a transition)', () => {
      for (const status of ALL_STATUSES) {
        expect(ORDER_TRANSITIONS[status]).not.toContain(status);
      }
    });

    it('lists no duplicates', () => {
      for (const status of ALL_STATUSES) {
        const targets = ORDER_TRANSITIONS[status];
        expect(new Set(targets).size).toBe(targets.length);
      }
    });
  });

  // ─── The forward pipeline ───────────────────────────────────────────────────
  // PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED is the happy path, and
  // skipping forward is allowed: a small shop that packs and ships the same hour
  // should not have to click through four states to record the truth.

  describe('forward moves through the live pipeline', () => {
    it.each([
      [OrderStatus.PENDING, OrderStatus.CONFIRMED],
      [OrderStatus.PENDING, OrderStatus.PROCESSING],
      [OrderStatus.PENDING, OrderStatus.SHIPPED],
      [OrderStatus.PENDING, OrderStatus.DELIVERED],
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      [OrderStatus.CONFIRMED, OrderStatus.SHIPPED],
      [OrderStatus.CONFIRMED, OrderStatus.DELIVERED],
      [OrderStatus.PROCESSING, OrderStatus.SHIPPED],
      [OrderStatus.PROCESSING, OrderStatus.DELIVERED],
      [OrderStatus.SHIPPED, OrderStatus.DELIVERED],
    ])('allows %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });

    it.each([
      [OrderStatus.CONFIRMED, OrderStatus.PENDING],
      [OrderStatus.PROCESSING, OrderStatus.PENDING],
      [OrderStatus.PROCESSING, OrderStatus.CONFIRMED],
      [OrderStatus.SHIPPED, OrderStatus.PENDING],
      [OrderStatus.SHIPPED, OrderStatus.CONFIRMED],
      [OrderStatus.SHIPPED, OrderStatus.PROCESSING],
      [OrderStatus.DELIVERED, OrderStatus.PENDING],
      [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
      [OrderStatus.DELIVERED, OrderStatus.PROCESSING],
      [OrderStatus.DELIVERED, OrderStatus.SHIPPED],
    ])('rejects the backward move %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  // ─── Same-status ────────────────────────────────────────────────────────────

  it.each(ALL_STATUSES)('rejects the no-op transition %s → %s', (status) => {
    expect(canTransition(status, status)).toBe(false);
  });

  // ─── Cancellation ───────────────────────────────────────────────────────────

  describe('cancellation', () => {
    it.each([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ])('allows %s → CANCELLED', (from) => {
      expect(canTransition(from, OrderStatus.CANCELLED)).toBe(true);
    });

    it('allows the terminal pair REFUNDED → CANCELLED', () => {
      expect(canTransition(OrderStatus.REFUNDED, OrderStatus.CANCELLED)).toBe(true);
    });
  });

  // ─── Refund ─────────────────────────────────────────────────────────────────
  // Money can only come back after it plausibly moved: the goods left the
  // warehouse, or the order was cancelled after being paid for.

  describe('refund', () => {
    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED])(
      'allows %s → REFUNDED',
      (from) => {
        expect(canTransition(from, OrderStatus.REFUNDED)).toBe(true);
      },
    );

    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'rejects %s → REFUNDED (nothing shipped, cancel it instead)',
      (from) => {
        expect(canTransition(from, OrderStatus.REFUNDED)).toBe(false);
      },
    );
  });

  // ─── Revive ─────────────────────────────────────────────────────────────────
  // A mistaken cancellation is undone by putting the order back into the queue,
  // never straight into "shipped" — that would claim a parcel left the building.

  describe('revive from CANCELLED', () => {
    it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.PROCESSING])(
      'allows CANCELLED → %s (re-reserves stock)',
      (to) => {
        expect(canTransition(OrderStatus.CANCELLED, to)).toBe(true);
      },
    );

    it.each([OrderStatus.SHIPPED, OrderStatus.DELIVERED])(
      'rejects CANCELLED → %s (revive first, then advance)',
      (to) => {
        expect(canTransition(OrderStatus.CANCELLED, to)).toBe(false);
      },
    );
  });

  // ─── REFUNDED is (almost) terminal ──────────────────────────────────────────

  describe('REFUNDED', () => {
    it.each([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ])('rejects REFUNDED → %s (the money is already back with the customer)', (to) => {
      expect(canTransition(OrderStatus.REFUNDED, to)).toBe(false);
    });
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  describe('allowedTransitions', () => {
    it('returns exactly the table row, as a fresh array', () => {
      const first = allowedTransitions(OrderStatus.PENDING);
      const second = allowedTransitions(OrderStatus.PENDING);

      expect(first).toEqual([...ORDER_TRANSITIONS[OrderStatus.PENDING]]);
      expect(first).not.toBe(second);
    });

    it('every returned target satisfies canTransition', () => {
      for (const from of ALL_STATUSES) {
        for (const to of allowedTransitions(from)) {
          expect(canTransition(from, to)).toBe(true);
        }
      }
    });

    it('every status NOT returned is rejected by canTransition', () => {
      for (const from of ALL_STATUSES) {
        const allowed = new Set(allowedTransitions(from));
        for (const to of ALL_STATUSES) {
          if (allowed.has(to)) continue;
          expect(canTransition(from, to)).toBe(false);
        }
      }
    });
  });

  describe('isTerminalStatus', () => {
    it.each([OrderStatus.CANCELLED, OrderStatus.REFUNDED])('reports %s as terminal', (status) => {
      expect(isTerminalStatus(status)).toBe(true);
    });

    it.each([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ])('reports %s as live', (status) => {
      expect(isTerminalStatus(status)).toBe(false);
    });
  });

  // ─── Reachability ───────────────────────────────────────────────────────────
  // A guard against a future edit that strands a status: every status must be
  // reachable from PENDING (where every order starts).

  it('makes every status reachable from PENDING', () => {
    const seen = new Set<OrderStatus>([OrderStatus.PENDING]);
    const queue: OrderStatus[] = [OrderStatus.PENDING];

    while (queue.length > 0) {
      const current = queue.shift() as OrderStatus;
      for (const next of allowedTransitions(current)) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }

    expect([...seen].sort()).toEqual([...ALL_STATUSES].sort());
  });
});
