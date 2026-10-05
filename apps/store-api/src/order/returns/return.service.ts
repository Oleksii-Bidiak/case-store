import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { ReturnRepository } from './return.repository';
import { OrderRepository } from '../order.repository';
import { ShopNotifier } from '../../notification';
import { ReturnEntity } from './entities';
import { RESTOCK_ON_STATUS, canTransitionReturn } from './return-state-machine';
import type { CreateReturnDto, ResolveReturnDto, ReturnListQueryDto } from './dto';
import { refundExceedsOrderBalanceError, refundExceedsReturnedValueError } from './return.errors';
import { centsToString, toCents } from '../../addon-service';
import type { Paginated } from '../../common/pagination';
import type {
  AssertRefundWithinBalance,
  AssertReturnClaimable,
  ReturnClaimRow,
  ReturnWithItems,
} from './return.types';

const DEFAULT_PAGE = 1;
/** The one admin page size (TASK-423) — was 10, which no admin table uses now. */
const DEFAULT_LIMIT = 20;

/**
 * Cap on `GET /returns` (TASK-608). A customer files a handful of returns in a
 * lifetime; the cap bounds the read, it is not a page size anyone will reach.
 */
export const MY_RETURNS_LIMIT = 100;

/**
 * Statuses from which a customer may open a return (TASK-340).
 *
 * The goods have to have reached them first. A PENDING or PROCESSING order is
 * cancelled, not returned — cancelling gives the stock straight back, while a
 * return is a physical journey with a parcel at the end of it.
 */
const RETURNABLE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
]);

/** Return statuses that no longer hold a claim on the units they name. */
const DEAD_RETURN_STATUSES: ReadonlySet<ReturnStatus> = new Set([ReturnStatus.REJECTED]);

/**
 * ReturnService — the RMA minimum (TASK-340).
 *
 * Ukrainian law gives 14 days to return, and until now the system had no record
 * of a return at all: `REFUNDED` on an order was a label with no money and no
 * stock behind it (edge case E-12).
 */
@Injectable()
export class ReturnService {
  constructor(
    private readonly returnRepository: ReturnRepository,
    private readonly orderRepository: OrderRepository,
    private readonly logger: PinoLogger,
    private readonly shopNotifier: ShopNotifier,
  ) {
    this.logger.setContext(ReturnService.name);
  }

  /**
   * Open a return against an order the caller owns.
   *
   * @throws NotFoundException when the order does not exist or is not theirs —
   *   never revealing that someone else's order exists.
   * @throws BadRequestException when the order has not shipped, a line does not
   *   belong to it, or the request would return more units than were bought.
   */
  async createReturn(userId: string, orderId: string, dto: CreateReturnDto): Promise<ReturnEntity> {
    const order = await this.orderRepository.findById(orderId);

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    const assertClaimable = this.assertLinesAreReturnable(order, dto);

    const created = await this.returnRepository.create(
      {
        orderId,
        ...(dto.reason ? { reason: dto.reason } : {}),
        createdByUserId: userId,
        items: dto.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      },
      assertClaimable,
      // TASK-677: the shop's Telegram ping, in the return's own transaction.
      // Only this door passes it — a return an operator opens in the admin
      // (`adminCreateReturn`) has staff as its trigger and pings no one.
      async (tx, inserted) => {
        await this.shopNotifier.enqueueReturnRequested(
          {
            returnId: inserted.id,
            orderId: inserted.orderId,
            itemsCount: inserted.items.reduce((sum, item) => sum + item.quantity, 0),
            reason: inserted.reason,
          },
          tx,
        );
      },
    );

    this.logger.info(
      { event: 'return.requested', returnId: created.id, orderId, userId },
      'Return requested',
    );

    return ReturnEntity.fromPrisma(created);
  }

  /**
   * Admin — open a return on a customer's behalf (TASK-469).
   *
   * WHY A SECOND DOOR AND NOT A FLAG ON THE FIRST. The customer door is scoped by
   * `order.userId !== userId`, and that scoping is the whole of its security. A
   * guest order has `userId === null` and a phone order taken by an operator
   * (TASK-341) has it too, so for those the customer door can never open — not
   * "is awkward", cannot. Roughly half the orders in the shop were therefore
   * unreturnable through the system, and the operator's only recourse was to set
   * `OrderStatus.REFUNDED` by hand: a label with no lines, no quantities and no
   * stock behind it, which is exactly the hole `Return` was created to close
   * (edge case E-12).
   *
   * Everything else is deliberately IDENTICAL to the customer path — the order
   * must have shipped, every line must belong to it, and the sum of live claims
   * must not exceed what was bought. An operator is trusted to act for a
   * customer, not to return four of three.
   *
   * `createdByUserId` records the operator, which is the one fact the two doors
   * do not share.
   */
  async adminCreateReturn(
    actorUserId: string,
    orderId: string,
    dto: CreateReturnDto,
  ): Promise<ReturnEntity> {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const assertClaimable = this.assertLinesAreReturnable(order, dto);

    const created = await this.returnRepository.create(
      {
        orderId,
        ...(dto.reason ? { reason: dto.reason } : {}),
        createdByUserId: actorUserId,
        items: dto.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      },
      assertClaimable,
    );

    this.logger.info(
      {
        event: 'return.requested',
        returnId: created.id,
        orderId,
        actorUserId,
        onBehalfOf: order.userId ?? null,
        source: 'admin',
      },
      "Return opened by an operator on the customer's behalf",
    );

    return ReturnEntity.fromPrisma(created, { includeInternal: true });
  }

  /**
   * Admin — the returns already opened against one order (TASK-469).
   *
   * Exists so the status control can ask "is there one?" before offering to
   * create it. The customer-facing twin cannot answer that question for an
   * operator: it is scoped to the caller's own orders and a guest order has no
   * caller at all.
   */
  async adminGetOrderReturns(orderId: string): Promise<ReturnEntity[]> {
    const returns = await this.returnRepository.findByOrderId(orderId);
    return returns.map((row) => ReturnEntity.fromPrisma(row, { includeInternal: true }));
  }

  /** A customer's view of the returns they have opened against one of their orders. */
  async getOrderReturns(userId: string, orderId: string): Promise<ReturnEntity[]> {
    const order = await this.orderRepository.findById(orderId);

    if (!order || order.userId !== userId) {
      throw new NotFoundException('Order not found');
    }

    const returns = await this.returnRepository.findByOrderId(orderId);
    return returns.map((row) => ReturnEntity.fromPrisma(row));
  }

  /**
   * A customer's view of every return they have, across all their orders
   * (TASK-608) — what lets the order history show a request's status without a
   * speculative `GET /orders/:id/returns` per row.
   *
   * Customer projection: no operator notes, no author id.
   */
  async getMyReturns(userId: string): Promise<ReturnEntity[]> {
    const returns = await this.returnRepository.findByUserId(userId, MY_RETURNS_LIMIT);
    return returns.map((row) => ReturnEntity.fromPrisma(row));
  }

  /** Admin — the returns queue, newest request first. */
  async adminGetReturns(query: ReturnListQueryDto): Promise<Paginated<ReturnEntity>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const { returns, total } = await this.returnRepository.findAll(query);

    return {
      items: returns.map((row) => ReturnEntity.fromPrisma(row, { includeInternal: true })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Admin — one return in full. */
  async adminGetReturn(returnId: string): Promise<ReturnEntity> {
    const row = await this.returnRepository.findById(returnId);

    if (!row) {
      throw new NotFoundException('Return not found');
    }

    return ReturnEntity.fromPrisma(row, { includeInternal: true });
  }

  /**
   * Admin — record the operator's decision, and credit stock back when the goods
   * are physically in hand.
   *
   * Restocking is requested explicitly (`restock: true`) rather than inferred from
   * the status, because "the parcel arrived" and "the contents are sellable again"
   * are not the same claim: goods can come back broken, opened, or not ours at
   * all. The operator is the only one who can see which it is.
   *
   * @throws NotFoundException when the return does not exist.
   * @throws ConflictException when the state machine forbids the move, or when
   *   the goods were already credited back to stock.
   * @throws BadRequestException when `refundedAmount` exceeds the value of the
   *   returned lines or what the order has left to refund (TASK-785) — see
   *   {@link assertRefundWithinCeilings}.
   */
  async resolveReturn(returnId: string, dto: ResolveReturnDto): Promise<ReturnEntity> {
    const existing = await this.returnRepository.findById(returnId);

    if (!existing) {
      throw new NotFoundException('Return not found');
    }

    if (!canTransitionReturn(existing.status, dto.status)) {
      throw new ConflictException(`A return cannot move from ${existing.status} to ${dto.status}`);
    }

    if (dto.restock && dto.status !== RESTOCK_ON_STATUS) {
      throw new BadRequestException(
        `Stock is credited back when a return is marked ${RESTOCK_ON_STATUS}, not ${dto.status}`,
      );
    }

    // Belt-and-braces in front of the repository's authoritative guard: it gives
    // the operator a clean 409 instead of one raised from inside a transaction.
    if (dto.restock && existing.restockedAt !== null) {
      throw new ConflictException(
        'These returned goods have already been credited back to inventory',
      );
    }

    const resolved = await this.returnRepository.resolve(
      returnId,
      {
        status: dto.status,
        ...(dto.operatorNotes !== undefined ? { operatorNotes: dto.operatorNotes } : {}),
        ...(dto.refundedAmount !== undefined ? { refundedAmount: dto.refundedAmount } : {}),
        // "Resolved" means a decision was reached, so every status but the initial
        // request stamps it.
        resolvedAt: new Date(),
      },
      {
        restock: dto.restock === true,
        // Only a real amount can be over a ceiling; null clears a mistyped one.
        ...(typeof dto.refundedAmount === 'string'
          ? { assertRefundable: assertRefundWithinCeilings(dto.refundedAmount) }
          : {}),
      },
    );

    this.logger.info(
      {
        event: 'return.resolved',
        returnId,
        orderId: existing.orderId,
        from: existing.status,
        to: dto.status,
        restocked: dto.restock === true,
      },
      'Return resolved',
    );

    return ReturnEntity.fromPrisma(resolved, { includeInternal: true });
  }

  /**
   * The three rules a return has to satisfy whichever door it came through
   * (TASK-469): the goods must have travelled, every line must belong to this
   * order, and the units asked for plus those already claimed must not exceed
   * what was bought.
   *
   * Shared rather than duplicated because a divergence here is invisible: the
   * admin path would keep accepting returns the customer path refuses, and the
   * first sign of it would be stock credited back for goods nobody bought.
   *
   * The first two are checked here and now. The third depends on every other
   * return of the order, so it is RETURNED as a closure for the repository to run
   * inside the transaction that inserts, against a ledger read under a lock on
   * the order row (TASK-784). Checked here, against a read of our own, it let two
   * concurrent requests for the last unit both see "0 claimed" and both succeed.
   *
   * @throws BadRequestException on either of the first two; the returned check
   *   throws it on the third.
   */
  private assertLinesAreReturnable(
    order: { id: string; status: OrderStatus; items: Array<{ id: string; quantity: number }> },
    dto: CreateReturnDto,
  ): AssertReturnClaimable {
    if (!RETURNABLE_ORDER_STATUSES.has(order.status)) {
      throw new BadRequestException(
        'Only shipped or delivered orders can be returned — cancel the order instead',
      );
    }

    const orderedByLineId = new Map(order.items.map((item) => [item.id, item.quantity]));
    for (const line of dto.items) {
      if (!orderedByLineId.has(line.orderItemId)) {
        throw new BadRequestException('That item is not part of this order');
      }
    }

    // A line may appear in more than one return — a customer who bought three may
    // send back one now and another next week — so the cap is over the SUM of
    // live returns plus this request, not over this request alone. Without it a
    // buyer could return the same unit repeatedly and be credited each time.
    //
    // The request's OWN lines are summed first (review of plan 180). The cap used
    // to be evaluated per array element, and nothing forbids repeating an
    // `orderItemId`, so `[{item-1, 2}, {item-1, 2}]` against a 3-unit line passed
    // twice at 0+2 ≤ 3 and produced a return holding 4 of 3. That is not a
    // paperwork error: resolving it as RECEIVED with `restock` loops the return's
    // items and credits stock for each, so the shop invents a unit it never got
    // back and then oversells it. Reachable from the customer door and from the
    // operator one, since both call this helper.
    const requestedByLineId = new Map<string, number>();
    for (const line of dto.items) {
      requestedByLineId.set(
        line.orderItemId,
        (requestedByLineId.get(line.orderItemId) ?? 0) + line.quantity,
      );
    }

    return (ledger) => {
      const alreadyClaimed = countClaimedUnits(ledger);
      for (const [orderItemId, requested] of requestedByLineId) {
        const ordered = orderedByLineId.get(orderItemId) as number;
        const claimed = alreadyClaimed.get(orderItemId) ?? 0;
        if (claimed + requested > ordered) {
          throw new BadRequestException(
            `Cannot return ${requested} of that item — ${ordered - claimed} remain returnable`,
          );
        }
      }
    };
  }
}

/**
 * How many units of each order line are already spoken for by earlier returns.
 *
 * A REJECTED return releases its claim — the shop said no, the units never came
 * back, and the customer may legitimately try again with a better reason. Every
 * other status still holds them.
 */
function countClaimedUnits(ledger: ReturnClaimRow[]): Map<string, number> {
  const claimed = new Map<string, number>();

  for (const row of ledger) {
    if (DEAD_RETURN_STATUSES.has(row.status)) continue;
    for (const item of row.items) {
      claimed.set(item.orderItemId, (claimed.get(item.orderItemId) ?? 0) + item.quantity);
    }
  }

  return claimed;
}

/**
 * The two ceilings on `refundedAmount` (TASK-785), returned as a closure for the
 * repository to run inside the resolve transaction against a ledger read under a
 * lock on the order row — the same shape as the quantity cap (TASK-784).
 *
 * 1. **Returned value** — Σ (unit price × returned quantity) over this return's
 *    lines. GROSS line value: a discount is stored once on the order
 *    (`Order.discount`, clamped against `subtotal`) and never allocated to lines,
 *    so there is no per-line net price to use. Add-ons and shipping are not part
 *    of it, matching the DTO's "may be less than the line total".
 * 2. **Order balance** — `order.total` less every amount already recorded on the
 *    order's OTHER returns. This is the one that catches the discount: a 499.00
 *    line bought for 400.00 after a coupon refunds at most 400.00.
 *
 * All arithmetic in integer cents, like every money total in this codebase.
 */
function assertRefundWithinCeilings(refundedAmount: string): AssertRefundWithinBalance {
  const requested = toCents(refundedAmount);

  return ({ orderTotal, otherRefunds, items }) => {
    const returnedValue = items.reduce(
      (sum, item) => sum + toCents(item.unitPrice) * item.quantity,
      0,
    );
    if (requested > returnedValue) {
      throw refundExceedsReturnedValueError(refundedAmount, centsToString(returnedValue));
    }

    const alreadyRefunded = otherRefunds.reduce(
      (sum, row) => sum + (row.refundedAmount === null ? 0 : toCents(row.refundedAmount)),
      0,
    );
    const remaining = Math.max(toCents(orderTotal) - alreadyRefunded, 0);
    if (requested > remaining) {
      throw refundExceedsOrderBalanceError(refundedAmount, centsToString(remaining));
    }
  };
}

/** Re-exported for the module's public surface. */
export type { ReturnWithItems };
