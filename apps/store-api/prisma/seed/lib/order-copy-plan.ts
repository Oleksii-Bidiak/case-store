import type { CopyPairSpec } from '../data/order-copies.data';
import type { OrderSpec } from '../types';
import {
  copyBindsOriginalCustomer,
  ledgerTotals,
  offsetAmountKop,
  PRE_SHIPMENT_STATUSES,
} from './domain';
import { planOrder, type OrderPlan, type PlanContext } from './order-plan';

/**
 * A copy pair as `OrderRepository.createManualCopy` leaves it (TASK-2048):
 *
 * - with «Скасувати оригінал» the original is cancelled (only from a
 *   pre-shipment status) on a row noted COPIED_TO_ORDER; without it a
 *   `current → current` row carries the note;
 * - the copy is born on a row noted COPY_OF_ORDER, authored by whoever made it;
 * - off a cancelled original, «Залік»: OFFSET_TO_ORDER out of it and
 *   OFFSET_FROM_ORDER into the copy, `min(paid − refunded, copy total)` each
 *   (`offsetAmountKop`), both naming the other order.
 *
 * The data states the two orders; this adds those rows and plans both with the
 * same `planOrder` every other seeded order goes through.
 */
export interface CopyPairPlan {
  original: OrderPlan;
  copy: OrderPlan;
  offsetKop: number;
}

const HOURS_PER_DAY = 24;

function fail(pair: CopyPairSpec, message: string): never {
  throw new Error(
    `Seed copy «${pair.copy.key}» of «${pair.original.key}» is not reachable: ${message}`,
  );
}

export function planCopyPair(pair: CopyPairSpec, ctx: PlanContext): CopyPairPlan {
  const { original, copy, cancelOriginal, at } = pair;
  const author = 'owner' as const;

  if (copy.copiedFrom !== original.key) fail(pair, 'copiedFrom must name the original');
  if (!copy.byOperator) fail(pair, 'a copy is made in the admin panel');
  // Same customer: the copy replaces the original or takes its money.
  if (copy.email !== original.email || copy.guest) fail(pair, 'a copy keeps the original customer');
  const copyAtDays = original.daysAgo - at / HOURS_PER_DAY;
  if (Math.abs(copy.daysAgo - copyAtDays) > 1e-9) {
    fail(pair, `the copy is placed ${at} h after the original (daysAgo ${copyAtDays})`);
  }

  let originalSpec: OrderSpec;
  if (cancelOriginal) {
    const flow = original.statusFlow;
    const before = flow[flow.length - 2];
    if (flow[flow.length - 1] !== 'CANCELLED' || original.statusAt?.CANCELLED !== at) {
      fail(pair, 'with «Скасувати оригінал» the original is cancelled at the copy time');
    }
    if (!PRE_SHIPMENT_STATUSES.has(before)) {
      fail(pair, `an original in ${before} cannot be cancelled by a copy`);
    }
    originalSpec = {
      ...original,
      statusActors: { ...original.statusActors, CANCELLED: author },
      statusNotes: { ...original.statusNotes, CANCELLED: 'COPIED_TO_ORDER' },
    };
  } else {
    originalSpec = {
      ...original,
      markers: [...(original.markers ?? []), { at, note: 'COPIED_TO_ORDER', actor: author }],
    };
  }

  const copyBase: OrderSpec = {
    ...copy,
    statusActors: { ...copy.statusActors, PENDING: author },
    statusNotes: { ...copy.statusNotes, PENDING: 'COPY_OF_ORDER' },
  };

  // Plan both without the pair first: the offset depends on what the original
  // still holds and on what the copy costs.
  const originalDraft = planOrder(originalSpec, ctx, { draft: true });
  const copyDraft = planOrder(copyBase, ctx, { draft: true });
  const held = ledgerTotals(originalDraft.entries.map((e) => ({ ...e, voidedAt: null })));
  const offsetFromOriginal = cancelOriginal || original.status === 'CANCELLED';
  const offsetKop = offsetFromOriginal
    ? offsetAmountKop({ ...held, copyTotalKop: copyDraft.totalKop })
    : 0;
  if (
    cancelOriginal &&
    !copyBindsOriginalCustomer(
      { status: 'CANCELLED', paidKop: held.paidKop, refundedKop: held.refundedKop },
      cancelOriginal,
    )
  ) {
    fail(pair, 'copyBindsOriginalCustomer refused');
  }

  if (offsetKop === 0) {
    return { original: originalDraft, copy: planOrder(copyBase, ctx), offsetKop };
  }
  return {
    original: planOrder(
      {
        ...originalSpec,
        money: [
          ...(originalSpec.money ?? []),
          {
            type: 'offset',
            kind: 'OFFSET_TO_ORDER',
            counterpart: copy.key,
            amountKop: offsetKop,
            at,
            actor: author,
          },
        ],
      },
      ctx,
    ),
    copy: planOrder(
      {
        ...copyBase,
        money: [
          {
            type: 'offset',
            kind: 'OFFSET_FROM_ORDER',
            counterpart: original.key,
            amountKop: offsetKop,
            at: 0,
            actor: author,
          },
          ...(copyBase.money ?? []),
        ],
      },
      ctx,
    ),
    offsetKop,
  };
}
