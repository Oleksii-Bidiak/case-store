import { PrismaClient } from '@prisma/client';
import { returnSpecs } from '../data/returns.data';
import { OrderMoneyRepository } from '../lib/domain';
import type { OrderPlan } from '../lib/order-plan';
import { planReturns } from '../lib/return-plan';
import type { SeedActor } from '../types';
import { actorIdOf, type OrderActors } from './orders.seeder';

/**
 * Returns in every status, decision and repair step (TASK-2569), planned by
 * `lib/return-plan.ts` and then handed to the domain's own money code:
 * `OrderMoneyRepository.recompute` re-derives each touched order,
 * `syncReturnStatus` each return and `syncAttemptStatus` each LiqPay attempt —
 * and a derivation that disagrees with the plan rolls the order back with a
 * readable error.
 *
 * Runs after `seedOrders` and takes its plans, so every date lines up with the
 * order it belongs to. Idempotent: the returns (items, decision and repair
 * events cascade) and their payouts are deleted by id and written again.
 */
export async function seedReturns(
  prisma: PrismaClient,
  orderPlans: readonly OrderPlan[],
  actors: OrderActors,
) {
  const plan = planReturns(
    returnSpecs,
    new Map(orderPlans.map((p) => [p.spec.key, p])),
    Date.now(),
  );
  const ids = plan.returns.map((r) => r.id);
  const customerIdByEmail = new Map(actors.customers.map((c) => [c.email, c.id]));
  const actorFor = (order: OrderPlan) => {
    const customerId = order.spec.email ? (customerIdByEmail.get(order.spec.email) ?? null) : null;
    return (actor: SeedActor | null) => (actor ? actorIdOf(actor, actors, customerId) : null);
  };
  const money = new OrderMoneyRepository(
    prisma as unknown as ConstructorParameters<typeof OrderMoneyRepository>[0],
  );

  // Payouts point at their return (Restrict): they go first, reversals before them.
  await prisma.orderMoneyEntry.deleteMany({
    where: { returnId: { in: ids }, reversalOfId: { not: null } },
  });
  await prisma.orderMoneyEntry.deleteMany({ where: { returnId: { in: ids } } });
  await prisma.return.deleteMany({ where: { id: { in: ids } } });

  const byOrderId = new Map(plan.orders.map((o) => [o.order.id, o.order]));
  for (const ret of plan.returns) {
    const actor = actorFor(byOrderId.get(ret.orderId)!);
    await prisma.return.create({
      data: {
        id: ret.id,
        orderId: ret.orderId,
        status: ret.status,
        reason: ret.reason,
        operatorNotes: ret.operatorNotes,
        requestedAt: ret.requestedAt,
        resolvedAt: ret.resolvedAt,
        restockedAt: ret.restockedAt,
        createdByUserId: actor(ret.createdBy),
        requestedOutcome: ret.requestedOutcome,
        channel: ret.channel,
        decision: ret.decision,
        decisionReason: ret.decisionReason,
        decidedAt: ret.decidedAt,
        decidedById: actor(ret.decidedBy),
        creditKop: ret.creditKop,
        creditReason: ret.creditReason,
        createdAt: ret.requestedAt,
        items: {
          create: ret.items.map((item) => ({
            id: item.id,
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            createdAt: item.createdAt,
          })),
        },
        decisionEvents: {
          create: ret.decisionEvents.map((e) => ({
            id: e.id,
            decision: e.decision,
            reason: e.reason,
            actorId: actor(e.actor),
            createdAt: e.at,
          })),
        },
        repairEvents: {
          create: ret.repairEvents.map((e) => ({
            id: e.id,
            step: e.step,
            result: e.result,
            destination: e.destination,
            ttn: e.ttn,
            note: e.note,
            actorId: actor(e.actor),
            createdAt: e.at,
          })),
        },
      },
    });
  }

  let payoutCount = 0;
  for (const outcome of plan.orders) {
    const { order } = outcome;
    const actor = actorFor(order);
    await prisma.$transaction(
      async (tx) => {
        for (const p of outcome.payouts) {
          await tx.orderMoneyEntry.create({
            data: {
              id: p.id,
              orderId: order.id,
              direction: p.direction,
              kind: p.kind,
              amountKop: p.amountKop,
              returnId: p.returnId,
              paymentId: p.paymentId,
              providerRef: p.providerRef,
              providerState: p.providerState,
              actorId: actor(p.actor),
              reason: p.reason,
              occurredAt: p.occurredAt,
              createdAt: p.occurredAt,
            },
          });
        }
        if (outcome.history.length) {
          await tx.orderStatusHistory.createMany({
            data: outcome.history.map((row) => ({
              orderId: order.id,
              changeType: row.changeType,
              fromStatus: row.fromStatus,
              toStatus: row.toStatus,
              fromPaymentStatus: row.fromPaymentStatus,
              toPaymentStatus: row.toPaymentStatus,
              note: row.note,
              changedBy: actor(row.actor),
              changedAt: row.at,
            })),
          });
        }
        // The planned status and label first: recompute then only confirms them
        // (a disagreement would make it write a history row — refused below).
        await tx.order.update({
          where: { id: order.id },
          data: { status: outcome.status, paymentStatus: outcome.paymentStatus },
        });

        const derived = await money.recompute(tx, order.id, null);
        if (derived.status !== outcome.status || derived.paymentStatus !== outcome.paymentStatus) {
          throw new Error(
            `seedReturns: order «${order.spec.key}» — recompute derives ` +
              `${derived.status}/${derived.paymentStatus}, the plan says ` +
              `${outcome.status}/${outcome.paymentStatus}.`,
          );
        }
        if (outcome.status === 'REFUNDED' && !(await money.isFullyRefunded(tx, order.id))) {
          throw new Error(`seedReturns: order «${order.spec.key}» is REFUNDED but not covered.`);
        }
        for (const ret of plan.returns.filter((r) => r.orderId === order.id)) {
          const status = await money.syncReturnStatus(tx, ret.id);
          if (status !== ret.status) {
            throw new Error(
              `seedReturns: return «${ret.spec.key}» — syncReturnStatus derives ${status}, ` +
                `the plan says ${ret.status}.`,
            );
          }
        }
        for (const attempt of outcome.attempts) {
          const status = await money.syncAttemptStatus(tx, attempt.paymentId);
          if (status !== attempt.status) {
            throw new Error(
              `seedReturns: LiqPay attempt of «${order.spec.key}» — syncAttemptStatus derives ` +
                `${status}, the plan says ${attempt.status}.`,
            );
          }
        }
      },
      { timeout: 60_000 },
    );
    payoutCount += outcome.payouts.length;
  }

  const statuses = [...new Set(plan.returns.map((r) => r.status))].sort().join('/');
  const refunded = plan.orders.filter((o) => o.status === 'REFUNDED').map((o) => o.order.spec.key);
  console.log(
    `  ✓ Returns: ${plan.returns.length} returns on ${plan.orders.length} orders (${statuses}), ` +
      `${payoutCount} payouts; derived REFUNDED: ${refunded.join(', ') || 'none'}`,
  );
}
