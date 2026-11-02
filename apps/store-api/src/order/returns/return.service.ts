import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  OrderStatus,
  ReturnChannel,
  ReturnDecision,
  ReturnRepairStep,
  ReturnStatus,
} from '@prisma/client';
import { ReturnRepository } from './return.repository';
import { OrderRepository } from '../order.repository';
import { ShopNotifier } from '../../notification';
import { ReturnEntity } from './entities';
import {
  RESTOCK_ON_STATUS,
  canTransitionReturn,
  decisionPermitsTransition,
  nextRepairStep,
  repairAcceptsSteps,
  repairStepRequiresResult,
  returnStatusAfterDecision,
} from './return-state-machine';
import type {
  AddRepairStepDto,
  CreateReturnDto,
  DecideReturnDto,
  ReduceReturnCreditDto,
  ResolveReturnDto,
  ReturnListQueryDto,
} from './dto';
import {
  repairNotInProgressError,
  repairResultNotAllowedError,
  repairResultRequiredError,
  repairStepOutOfOrderError,
  creditAboveComputedError,
  creditBelowPaidOutError,
  creditNotRefundError,
  decisionLockedError,
  decisionReasonRequiredError,
  decisionUnchangedError,
  invalidReturnTransitionError,
  refundIsDerivedError,
  returnQuantityExceededOnReopenError,
  useDecisionEndpointError,
  orderNotReturnableError,
  restockRequiresReceivedError,
  returnAlreadyRestockedError,
  returnItemNotInOrderError,
  returnNotFoundError,
  returnOrderNotFoundError,
  returnQuantityExceededError,
  returnStatusRequiredError,
  returnUpdateEmptyError,
} from './return.errors';
import type { Paginated } from '../../common/pagination';
import { assessCreditChange } from '../order-money';
import type {
  AssertReturnClaimable,
  ReturnClaimRow,
  ReturnDecideOptions,
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
 * Statuses only a decision sets (TASK-1961, TASK-2044); PATCH refuses them with
 * RETURN_USE_DECISION_ENDPOINT.
 */
const DECISION_STATUSES: ReadonlySet<ReturnStatus> = new Set([
  ReturnStatus.APPROVED,
  ReturnStatus.REJECTED,
]);

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
      throw returnOrderNotFoundError();
    }

    const assertClaimable = this.assertLinesAreReturnable(order, dto);

    const created = await this.returnRepository.create(
      {
        orderId,
        ...(dto.reason ? { reason: dto.reason } : {}),
        createdByUserId: userId,
        ...(dto.requestedOutcome ? { requestedOutcome: dto.requestedOutcome } : {}),
        channel: ReturnChannel.ACCOUNT,
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
   * Open a return from the guest link (TASK-1965).
   *
   * `orderId` must already be proven by the order's access token —
   * `OrderService.resolveGuestOrderId` is the only caller-side source of it. No
   * ownership check follows: the token IS the ownership, and an account-owned
   * order reached by its token (a phone order) is accepted on purpose.
   *
   * Otherwise the customer door: shipped-only, lines of this order, the locked
   * cap over earlier returns, the shop's Telegram ping. Nobody is recorded as the
   * author; the GUEST_LINK channel says where it came from.
   */
  async createGuestReturn(orderId: string, dto: CreateReturnDto): Promise<ReturnEntity> {
    const order = await this.orderRepository.findById(orderId);

    if (!order) {
      throw returnOrderNotFoundError();
    }

    const assertClaimable = this.assertLinesAreReturnable(order, dto);

    const created = await this.returnRepository.create(
      {
        orderId,
        ...(dto.reason ? { reason: dto.reason } : {}),
        createdByUserId: null,
        ...(dto.requestedOutcome ? { requestedOutcome: dto.requestedOutcome } : {}),
        channel: ReturnChannel.GUEST_LINK,
        items: dto.items.map((item) => ({
          orderItemId: item.orderItemId,
          quantity: item.quantity,
        })),
      },
      assertClaimable,
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
      { event: 'return.requested', returnId: created.id, orderId, source: 'guest_link' },
      'Return requested from the guest link',
    );

    return ReturnEntity.fromPrisma(created);
  }

  /** The returns on an order, for the holder of its access token (TASK-1965). */
  async getGuestOrderReturns(orderId: string): Promise<ReturnEntity[]> {
    const returns = await this.returnRepository.findByOrderId(orderId);
    return returns.map((row) => ReturnEntity.fromPrisma(row));
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
      throw returnOrderNotFoundError();
    }

    const assertClaimable = this.assertLinesAreReturnable(order, dto);

    const created = await this.returnRepository.create(
      {
        orderId,
        ...(dto.reason ? { reason: dto.reason } : {}),
        createdByUserId: actorUserId,
        // TASK-1963: what the customer told the operator, written down by staff.
        ...(dto.requestedOutcome ? { requestedOutcome: dto.requestedOutcome } : {}),
        channel: ReturnChannel.OPERATOR,
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
    const returns = await this.returnRepository.findByOrderId(orderId, { admin: true });
    return returns.map((row) => ReturnEntity.fromPrisma(row, { includeInternal: true }));
  }

  /** A customer's view of the returns they have opened against one of their orders. */
  async getOrderReturns(userId: string, orderId: string): Promise<ReturnEntity[]> {
    const order = await this.orderRepository.findById(orderId);

    if (!order || order.userId !== userId) {
      throw returnOrderNotFoundError();
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
      throw returnNotFoundError();
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
   * @throws BadRequestException RETURN_USE_DECISION_ENDPOINT for APPROVED /
   *   REJECTED, RETURN_REFUND_DERIVED for REFUNDED (R2 A3: it follows from the
   *   payouts on the order ledger).
   */
  async resolveReturn(returnId: string, dto: ResolveReturnDto): Promise<ReturnEntity> {
    if (dto.status === undefined) {
      return this.updateReturnNotes(returnId, dto);
    }

    // TASK-1961/2044: approving and refusing are decisions, with an author and a
    // reason the customer sees. Setting them here would bypass both.
    if (DECISION_STATUSES.has(dto.status)) {
      throw useDecisionEndpointError(dto.status);
    }

    // R2 A3 (TASK-2046): money goes out as payouts on the order ledger, and a
    // return is REFUNDED once they cover its credit — never by a label.
    if (dto.status === ReturnStatus.REFUNDED) {
      throw refundIsDerivedError();
    }

    const existing = await this.returnRepository.findById(returnId);

    if (!existing) {
      throw returnNotFoundError();
    }

    if (
      !canTransitionReturn(existing.status, dto.status) ||
      !decisionPermitsTransition(dto.status, existing.decision)
    ) {
      throw invalidReturnTransitionError(existing.status, dto.status);
    }

    if (dto.restock && dto.status !== RESTOCK_ON_STATUS) {
      throw restockRequiresReceivedError(RESTOCK_ON_STATUS, dto.status);
    }

    // Belt-and-braces in front of the repository's authoritative guard: it gives
    // the operator a clean 409 instead of one raised from inside a transaction.
    if (dto.restock && existing.restockedAt !== null) {
      throw returnAlreadyRestockedError();
    }

    const resolved = await this.returnRepository.resolve(
      // TASK-1961/2044: the write is conditional on exactly what was validated.
      {
        id: existing.id,
        orderId: existing.orderId,
        status: existing.status,
        decision: existing.decision,
      },
      {
        status: dto.status,
        ...(dto.operatorNotes !== undefined ? { operatorNotes: dto.operatorNotes } : {}),
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
   * Admin — the operator's notes alone, on a return of ANY status (a PATCH
   * without a status). Approving and refusing moved to POST /decision
   * (TASK-1961/2044), so a REQUESTED or REJECTED return has no status step for
   * the notes to ride on. No transition: `resolvedAt` and the decision stay.
   *
   * @throws BadRequestException RETURN_UPDATE_EMPTY (no notes either),
   *   RETURN_STATUS_REQUIRED (restock without a status)
   * @throws NotFoundException RETURN_NOT_FOUND
   */
  private async updateReturnNotes(returnId: string, dto: ResolveReturnDto): Promise<ReturnEntity> {
    // Stock is a step of a transition — never a side effect of a note.
    if (dto.restock !== undefined) {
      throw returnStatusRequiredError();
    }
    if (dto.operatorNotes === undefined) {
      throw returnUpdateEmptyError();
    }

    const existing = await this.returnRepository.findById(returnId);

    if (!existing) {
      throw returnNotFoundError();
    }

    const updated = await this.returnRepository.updateNotes(existing.id, dto.operatorNotes);

    this.logger.info(
      {
        event: 'return.notesUpdated',
        returnId,
        orderId: existing.orderId,
        status: existing.status,
      },
      'Return notes updated',
    );

    return ReturnEntity.fromPrisma(updated, { includeInternal: true });
  }

  /**
   * Admin — the operator's decision on a return (TASK-1961, TASK-2044; B-12
   * theme 1.1): refund, replacement, repair or refusal, each with an author, a
   * date and a reason the customer sees.
   *
   * - The reason is required on a refusal and on any CHANGE of a decision
   *   already made (backfilled legacy decisions included): a silent change is
   *   exactly what B-12 ruled out.
   * - A refunded return is final; an identical decision (same reason) is refused
   *   so the history holds only real changes.
   * - The status follows from the decision ({@link returnStatusAfterDecision}).
   *   Re-opening a refusal claims its units back, so the "no more than was
   *   bought" cap is re-run under the order lock against the OTHER returns.
   *
   * @throws NotFoundException RETURN_NOT_FOUND
   * @throws BadRequestException RETURN_DECISION_REASON_REQUIRED
   * @throws ConflictException RETURN_DECISION_LOCKED, RETURN_REFUND_RECORDED,
   *   RETURN_DECISION_UNCHANGED, RETURN_TRANSITION_INVALID, RETURN_QUANTITY_EXCEEDED
   */
  async decideReturn(
    returnId: string,
    actorId: string,
    dto: DecideReturnDto,
  ): Promise<ReturnEntity> {
    const existing = await this.returnRepository.findById(returnId);

    if (!existing) {
      throw returnNotFoundError();
    }

    if (existing.status === ReturnStatus.REFUNDED) {
      throw decisionLockedError();
    }

    const reason = dto.reason ?? null;
    const needsReason = dto.decision === ReturnDecision.REJECT || existing.decision !== null;
    if (needsReason && reason === null) {
      throw decisionReasonRequiredError();
    }

    if (dto.decision === existing.decision && reason === existing.decisionReason) {
      throw decisionUnchangedError(dto.decision);
    }

    const status = returnStatusAfterDecision(existing.status, dto.decision);
    if (status === null) {
      throw invalidReturnTransitionError(existing.status, ReturnStatus.REJECTED);
    }

    const reclaimsUnits =
      existing.status === ReturnStatus.REJECTED && status !== ReturnStatus.REJECTED;
    const wasRefund = existing.decision === ReturnDecision.REFUND;
    const isRefund = dto.decision === ReturnDecision.REFUND;

    const options: ReturnDecideOptions = {
      ...(reclaimsUnits ? { assertClaimable: assertReturnReclaimable(existing) } : {}),
      // R2 A3 (TASK-2046): once money went out on this return (payouts on the
      // order ledger — only ever under a REFUND decision), only a refund may
      // stand on top of it; a refusal is refused on RECEIVED by the state
      // machine anyway.
      ...(wasRefund &&
      (dto.decision === ReturnDecision.REPLACEMENT || dto.decision === ReturnDecision.REPAIR)
        ? { refuseIfPaidOut: true }
        : {}),
      // «До повернення» exists exactly while the decision is REFUND.
      ...(isRefund && !wasRefund ? { credit: 'compute' as const, actorId } : {}),
      ...(!isRefund && wasRefund ? { credit: 'clear' as const, actorId } : {}),
    };

    const decided = await this.returnRepository.decide(
      {
        id: existing.id,
        orderId: existing.orderId,
        status: existing.status,
        decision: existing.decision,
      },
      {
        status,
        decision: dto.decision,
        decisionReason: reason,
        decidedById: actorId,
        decidedAt: new Date(),
      },
      options,
    );

    this.logger.info(
      {
        event: 'return.decided',
        returnId,
        orderId: existing.orderId,
        actorId,
        from: existing.decision,
        to: dto.decision,
        status,
      },
      'Return decided',
    );

    return ReturnEntity.fromPrisma(decided, { includeInternal: true });
  }

  /**
   * Admin — lower a refund return's credit («до повернення», R2 A3, TASK-2046):
   * an incomplete set, a scratched case. Only down from the computed value,
   * never below what was already paid out, always with a reason; the order's
   * balance and the return's derived status follow in the same transaction.
   *
   * @throws NotFoundException RETURN_NOT_FOUND
   * @throws BadRequestException RETURN_CREDIT_ABOVE_COMPUTED
   * @throws ConflictException RETURN_CREDIT_NOT_REFUND, RETURN_CREDIT_BELOW_PAID_OUT
   */
  async reduceReturnCredit(
    returnId: string,
    actorId: string,
    dto: ReduceReturnCreditDto,
  ): Promise<ReturnEntity> {
    const existing = await this.returnRepository.findById(returnId);

    if (!existing) {
      throw returnNotFoundError();
    }
    if (existing.decision !== ReturnDecision.REFUND || existing.creditKop == null) {
      throw creditNotRefundError();
    }

    const updated = await this.returnRepository.setCredit(
      {
        id: existing.id,
        orderId: existing.orderId,
        status: existing.status,
        decision: existing.decision,
      },
      { creditKop: dto.creditKop, creditReason: dto.reason },
      {
        assertCredit: (ceilings) => {
          const verdict = assessCreditChange({ ...ceilings, requestedKop: dto.creditKop });
          if (!verdict.ok) {
            throw verdict.refusal === 'ABOVE_COMPUTED'
              ? creditAboveComputedError(ceilings.computedKop)
              : creditBelowPaidOutError(ceilings.paidOutKop);
          }
        },
        actorId,
      },
    );

    this.logger.info(
      {
        event: 'return.creditReduced',
        returnId,
        orderId: existing.orderId,
        actorId,
        from: existing.creditKop,
        to: dto.creditKop,
      },
      'Return credit lowered',
    );

    return ReturnEntity.fromPrisma(updated, { includeInternal: true });
  }

  /**
   * Admin — record one step of a repair (TASK-2045; B-12 theme 1.7), with its
   * author, a time and, depending on the step, the service centre, the waybill
   * and the outcome.
   *
   * - The outcome belongs to RETURNED_FROM_SERVICE alone: required there,
   *   refused anywhere else.
   * - Steps are recorded only under a REPAIR decision on an open return, in
   *   {@link REPAIR_STEP_ORDER}, each once.
   * - UNREPAIRABLE does not change the decision. The operator changes it through
   *   {@link decideReturn}, with a reason; from then on steps are refused.
   *
   * @throws BadRequestException RETURN_REPAIR_RESULT_REQUIRED,
   *   RETURN_REPAIR_RESULT_NOT_ALLOWED
   * @throws NotFoundException RETURN_NOT_FOUND
   * @throws ConflictException RETURN_REPAIR_STEP_INVALID
   */
  async addRepairStep(
    returnId: string,
    actorId: string,
    dto: AddRepairStepDto,
  ): Promise<ReturnEntity> {
    const result = dto.result ?? null;
    if (repairStepRequiresResult(dto.step) && result === null) {
      throw repairResultRequiredError(dto.step);
    }
    if (!repairStepRequiresResult(dto.step) && result !== null) {
      throw repairResultNotAllowedError(ReturnRepairStep.RETURNED_FROM_SERVICE, dto.step);
    }

    const existing = await this.returnRepository.findById(returnId);

    if (!existing) {
      throw returnNotFoundError();
    }

    if (!repairAcceptsSteps(existing.status, existing.decision)) {
      throw repairNotInProgressError();
    }

    const expected = nextRepairStep((existing.repairEvents ?? []).map((event) => event.step));
    if (dto.step !== expected) {
      throw repairStepOutOfOrderError(expected, dto.step);
    }

    const recorded = await this.returnRepository.addRepairStep(returnId, {
      step: dto.step,
      result,
      destination: dto.destination ?? null,
      ttn: dto.ttn ?? null,
      note: dto.note ?? null,
      actorId,
      createdAt: new Date(),
    });

    this.logger.info(
      {
        event: 'return.repairStep',
        returnId,
        orderId: existing.orderId,
        actorId,
        step: dto.step,
        result,
      },
      'Repair step recorded',
    );

    return ReturnEntity.fromPrisma(recorded, { includeInternal: true });
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
      throw orderNotReturnableError();
    }

    const orderedByLineId = new Map(order.items.map((item) => [item.id, item.quantity]));
    for (const line of dto.items) {
      if (!orderedByLineId.has(line.orderItemId)) {
        throw returnItemNotInOrderError();
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
    return claimCap(orderedByLineId, sumByLine(dto.items), returnQuantityExceededError);
  }
}

/** Units per order line, summed over lines that may repeat an `orderItemId`. */
function sumByLine(lines: Array<{ orderItemId: string; quantity: number }>): Map<string, number> {
  const sums = new Map<string, number>();
  for (const line of lines) {
    sums.set(line.orderItemId, (sums.get(line.orderItemId) ?? 0) + line.quantity);
  }
  return sums;
}

/**
 * The "no more than was bought" cap as a closure over a ledger (TASK-784):
 * units already claimed by the ledger's live returns plus `requested` must not
 * exceed `ordered`, per line. Shared by a new request (400) and a re-opened
 * refusal (409, TASK-1961/2044) so the two can never drift apart.
 */
function claimCap(
  ordered: ReadonlyMap<string, number>,
  requested: ReadonlyMap<string, number>,
  exceeded: (requested: number, remaining: number) => Error,
): AssertReturnClaimable {
  return (ledger) => {
    const alreadyClaimed = countClaimedUnits(ledger);
    for (const [orderItemId, units] of requested) {
      const bought = ordered.get(orderItemId) as number;
      const claimed = alreadyClaimed.get(orderItemId) ?? 0;
      if (claimed + units > bought) {
        throw exceeded(units, bought - claimed);
      }
    }
  };
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
 * The cap for re-opening a refused return (TASK-1961, TASK-2044): its own units
 * plus those the order's OTHER live returns hold must not exceed what was bought.
 * Run by the repository against the ledger it reads under the order lock.
 */
function assertReturnReclaimable(existing: ReturnWithItems): AssertReturnClaimable {
  // The admin read joins each line's order line, so what was bought is on hand.
  const ordered = new Map(
    existing.items.map((item) => [item.orderItemId, item.orderItem?.quantity ?? 0]),
  );
  return claimCap(ordered, sumByLine(existing.items), returnQuantityExceededOnReopenError);
}

/** Re-exported for the module's public surface. */
export type { ReturnWithItems };
