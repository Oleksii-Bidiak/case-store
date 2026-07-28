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
import { ReturnEntity } from './entities';
import { RESTOCK_ON_STATUS, canTransitionReturn } from './return-state-machine';
import type { CreateReturnDto, ResolveReturnDto, ReturnListQueryDto } from './dto';
import type { ReturnWithItems } from './return.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

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
    const alreadyClaimed = await this.countClaimedUnits(orderId);
    for (const line of dto.items) {
      const ordered = orderedByLineId.get(line.orderItemId) as number;
      const claimed = alreadyClaimed.get(line.orderItemId) ?? 0;
      if (claimed + line.quantity > ordered) {
        throw new BadRequestException(
          `Cannot return ${line.quantity} of that item — ${ordered - claimed} remain returnable`,
        );
      }
    }

    const created = await this.returnRepository.create({
      orderId,
      ...(dto.reason ? { reason: dto.reason } : {}),
      items: dto.items.map((item) => ({
        orderItemId: item.orderItemId,
        quantity: item.quantity,
      })),
    });

    this.logger.info(
      { event: 'return.requested', returnId: created.id, orderId, userId },
      'Return requested',
    );

    return ReturnEntity.fromPrisma(created);
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

  /** Admin — the returns queue, newest request first. */
  async adminGetReturns(query: ReturnListQueryDto): Promise<{
    data: ReturnEntity[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const { returns, total } = await this.returnRepository.findAll(query);

    return {
      data: returns.map((row) => ReturnEntity.fromPrisma(row, { includeInternal: true })),
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
      { restock: dto.restock === true },
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
   * How many units of each order line are already spoken for by earlier returns.
   *
   * A REJECTED return releases its claim — the shop said no, the units never came
   * back, and the customer may legitimately try again with a better reason. Every
   * other status still holds them.
   */
  private async countClaimedUnits(orderId: string): Promise<Map<string, number>> {
    const existing = await this.returnRepository.findByOrderId(orderId);
    const claimed = new Map<string, number>();

    for (const row of existing) {
      if (DEAD_RETURN_STATUSES.has(row.status)) continue;
      for (const item of row.items) {
        claimed.set(item.orderItemId, (claimed.get(item.orderItemId) ?? 0) + item.quantity);
      }
    }

    return claimed;
  }
}

/** Re-exported for the module's public surface. */
export type { ReturnWithItems };
