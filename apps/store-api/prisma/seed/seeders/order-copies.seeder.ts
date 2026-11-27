import { PrismaClient } from '@prisma/client';
import { copyPairs } from '../data/order-copies.data';
import { centsToString } from '../lib/domain';
import { planCopyPair } from '../lib/order-copy-plan';
import {
  actorIdOf,
  buildPlanContext,
  clearOrderDependants,
  writeOrderPlan,
  type OrderActors,
} from './orders.seeder';

/**
 * «Створити копію» (TASK-2048): one copy that cancelled its paid original and
 * took its money with it («Залік»), and one repeat order made from a delivered
 * original without touching it. Both halves of each pair are seed-owned orders,
 * planned by `lib/order-copy-plan.ts` and written — and recomputed by the
 * domain — exactly like every other seeded order.
 *
 * Runs after `seedOrders`. Idempotent: deterministic ids, dependants rebuilt.
 */
export async function seedOrderCopies(prisma: PrismaClient, actors: OrderActors) {
  const specs = copyPairs.flatMap((pair) => [pair.original, pair.copy]);
  const { ctx, userIdByEmail } = await buildPlanContext(prisma, specs);
  const plans = copyPairs.map((pair) => planCopyPair(pair, ctx));
  const orders = plans.flatMap((p) => [p.original, p.copy]);

  await clearOrderDependants(
    prisma,
    orders.map((o) => o.id),
  );

  // Each half of «Залік» names the other order (FK Restrict), so both rows must
  // exist before either ledger is written. A first run creates bare rows that
  // the writes below fill in; later runs find them and change nothing here.
  for (const plan of orders) {
    await prisma.order.upsert({
      where: { id: plan.id },
      update: {},
      create: {
        id: plan.id,
        userId: plan.spec.email ? userIdByEmail.get(plan.spec.email)! : null,
        subtotal: '0.00',
        total: '0.00',
        createdAt: plan.createdAt,
      },
    });
  }

  for (const plan of orders) {
    const userId = plan.spec.email ? userIdByEmail.get(plan.spec.email)! : null;
    await writeOrderPlan(prisma, plan, (actor) => actorIdOf(actor, actors, userId), { userId });
  }

  const offsets = plans
    .filter((p) => p.offsetKop > 0)
    .map((p) => `${centsToString(p.offsetKop)} грн`);
  console.log(
    `  ✓ Order copies: ${plans.length} copies — ` +
      `${copyPairs.filter((p) => p.cancelOriginal).length} replacing a cancelled original ` +
      `(«Залік» ${offsets.join(', ') || 'none'}), ` +
      `${copyPairs.filter((p) => !p.cancelOriginal).length} without a cancel`,
  );
}
