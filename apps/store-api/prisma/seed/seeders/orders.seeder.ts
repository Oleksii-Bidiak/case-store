import { randomBytes, createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { cataloguePositions } from '../data/catalogue';
import { pickupPointsData } from '../data/delivery.data';
import { buildDiscountsData } from '../data/discounts.data';
import { orderSpecs } from '../data/orders.data';
import {
  AddonApplicabilityResolver,
  AddonServiceRepository,
  CategoryRepository,
  centsToString,
  OrderMoneyRepository,
} from '../lib/domain';
import {
  assertOrderSet,
  orderId,
  planOrder,
  type OrderPlan,
  type PlanContext,
} from '../lib/order-plan';
import type { OrderSpec, SeedActor, SeededUser } from '../types';
import { pickupPointId } from './delivery.seeder';

/** The accounts a seeded order's rows name as their authors. */
export interface OrderActors {
  /** The shop owner (the seed admin). */
  owner: { id: string };
  /** The order operator (orders@store.com) — confirms, ships, records money. */
  operator: { id: string };
  customers: SeededUser[];
}

/**
 * Check EVERY line item before writing anything, and report all the problems in
 * one message.
 *
 * The point is the "all at once" part. Resolving SKUs lazily inside the write
 * loop threw on the first miss, so re-pointing this file at a new catalogue
 * (TASK-366 replaced the whole assortment) meant one seed run per broken SKU.
 *
 * Out-of-stock is an error too, not just unknown. A seeded order whose item the
 * storefront shows as «Немає в наявності» is a demo that contradicts itself.
 */
function assertOrderSkusResolve(specs: readonly OrderSpec[], bySku: Map<string, unknown>) {
  const stockBySku = new Map(cataloguePositions().map((p) => [p.sku, p.stock]));
  const unknown: string[] = [];
  const soldOut: string[] = [];

  for (const sku of new Set(specs.flatMap((spec) => spec.items.map((i) => i.sku)))) {
    if (!bySku.has(sku)) unknown.push(sku);
    else if (stockBySku.get(sku) === 0) soldOut.push(sku);
  }

  const problems = [
    unknown.length && `unknown SKU(s): ${unknown.sort().join(', ')}`,
    soldOut.length && `out-of-stock SKU(s): ${soldOut.sort().join(', ')}`,
  ].filter(Boolean);

  if (problems.length) {
    throw new Error(
      `seedOrders: order data does not match the catalogue — ${problems.join('; ')}. ` +
        'Every order line must name a SKU that data/catalogue/** actually creates, with stock > 0.',
    );
  }
}

/**
 * Everything a plan needs from the database: catalogue prices, the add-ons the
 * real resolver says apply to each product, and the buyers' names and phones.
 */
export async function buildPlanContext(
  prisma: PrismaClient,
  specs: readonly OrderSpec[],
): Promise<{ ctx: PlanContext; userIdByEmail: Map<string, string> }> {
  const products = await prisma.product.findMany({
    where: { sku: { not: null } },
    select: { id: true, sku: true, price: true, categoryId: true },
  });
  const bySku = new Map(products.map((p) => [p.sku as string, p]));
  assertOrderSkusResolve(specs, bySku);

  // The add-ons a line may carry are what checkout would have offered: the real
  // applicability resolver (category template, nearest ancestor wins, product
  // deltas, inactive services dropped), at its effective price.
  const repo = prisma as unknown as ConstructorParameters<typeof AddonServiceRepository>[0];
  const resolver = new AddonApplicabilityResolver(
    new AddonServiceRepository(repo),
    // The slug-redirect repository is not on the resolver's read path.
    new CategoryRepository(repo, null as never),
  );
  const skusWithAddons = [
    ...new Set(specs.flatMap((s) => s.items.filter((i) => i.addons?.length).map((i) => i.sku))),
  ];
  const resolved = await resolver.resolveForProducts(
    skusWithAddons.map((sku) => {
      const p = bySku.get(sku)!;
      return { id: p.id, categoryId: p.categoryId };
    }),
  );

  const emails = [...new Set(specs.flatMap((s) => (s.email ? [s.email] : [])))];
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true },
  });
  const userByEmail = new Map(users.map((u) => [u.email, u]));
  for (const email of emails) {
    if (!userByEmail.has(email)) throw new Error(`seedOrders: unknown customer ${email}`);
  }

  const discounts = new Map(buildDiscountsData().map((d) => [d.code, d]));
  const ctx: PlanContext = {
    now: Date.now(),
    priceBySku: new Map(products.map((p) => [p.sku as string, Number(p.price)])),
    addonPrice: (sku, name) => {
      const addon = (resolved.get(bySku.get(sku)!.id) ?? []).find((a) => a.name === name);
      if (!addon) {
        throw new Error(
          `seedOrders: add-on «${name}» does not apply to ${sku} — checkout would not offer it ` +
            '(category template, deltas and isActive decide; see addons.data.ts).',
        );
      }
      return Number(addon.price);
    },
    discounts,
    pickupPoints: new Map(pickupPointsData.map((p) => [p.key, p])),
    buyer: (spec) => {
      if (spec.guest) return spec.guest;
      const u = userByEmail.get(spec.email!)!;
      return { firstName: u.firstName ?? '', lastName: u.lastName ?? '', phone: u.phone ?? '' };
    },
  };
  return { ctx, userIdByEmail: new Map(users.map((u) => [u.email, u.id])) };
}

/**
 * Clear what hangs off seeded orders and is rebuilt from scratch on every run:
 * the money ledger (reversals first — `reversal_of_id` is Restrict), the
 * returns (their lines point at order lines, Restrict; the returns seeder
 * writes them again) and the LiqPay attempts.
 */
export async function clearOrderDependants(prisma: PrismaClient, orderIds: string[]) {
  await prisma.orderMoneyEntry.deleteMany({
    where: { orderId: { in: orderIds }, reversalOfId: { not: null } },
  });
  await prisma.orderMoneyEntry.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.return.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
}

/**
 * Write one planned order — lines, add-ons, redemption, history, LiqPay
 * attempts and ledger — in one transaction, then let the domain's own
 * `OrderMoneyRepository.recompute` derive the five money columns, the payment
 * status and the order status. The plan states what they must be; a recompute
 * that disagrees rolls the order back with a readable error.
 */
export async function writeOrderPlan(
  prisma: PrismaClient,
  plan: OrderPlan,
  actorId: (actor: SeedActor) => string | null,
  extra: { userId: string | null } = { userId: null },
): Promise<void> {
  const { spec } = plan;
  const money = new OrderMoneyRepository(
    prisma as unknown as ConstructorParameters<typeof OrderMoneyRepository>[0],
  );
  const dec = (kop: number) => centsToString(kop);

  await prisma.$transaction(
    async (tx) => {
      const data = {
        userId: extra.userId,
        guestEmail: spec.guest?.email ?? null,
        guestPhone: spec.guest?.phone ?? null,
        guestName: spec.guest ? `${spec.guest.firstName} ${spec.guest.lastName}` : null,
        status: plan.status,
        paymentStatus: plan.paymentStatus,
        paymentMethod: spec.paymentMethod,
        deliveryMethod: plan.deliveryMethod,
        pickupPointId: plan.pickupPointKey ? pickupPointId(plan.pickupPointKey) : null,
        subtotal: dec(plan.subtotalKop),
        discount: dec(plan.discountKop),
        discountCode: spec.discountCode ?? null,
        shippingCost: dec(plan.shippingKop),
        tax: '0.00',
        addonsTotal: dec(plan.addonsKop),
        total: dec(plan.totalKop),
        shippingAddress: plan.shippingAddress as unknown as Prisma.InputJsonValue,
        notes: spec.notes ?? null,
        internalNotes: spec.internalNotes ?? null,
        trackingNumber: spec.trackingNumber ?? null,
        createdAt: plan.createdAt,
        deletedAt: null,
        restockedAt: plan.restockedAt,
        paidAt: plan.paidAt,
        reservationExpiresAt: null,
        copiedFromId: spec.copiedFrom ? orderId(spec.copiedFrom) : null,
      };
      await tx.order.upsert({
        where: { id: plan.id },
        update: data,
        create: {
          id: plan.id,
          ...data,
          // A guest's key to the order: random and never derivable from the
          // source, so nobody holds the link. Written once.
          ...(spec.guest
            ? {
                accessTokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
                accessTokenIssuedAt: plan.createdAt,
              }
            : {}),
        },
      });

      // Lines keep stable ids (return lines reference them, Restrict) and are
      // upserted; a line the data no longer declares goes.
      const lineIds = plan.lines.map((l) => l.id);
      await tx.orderItemAddon.deleteMany({ where: { orderItem: { orderId: plan.id } } });
      await tx.orderItem.deleteMany({ where: { orderId: plan.id, id: { notIn: lineIds } } });
      for (const line of plan.lines) {
        const product = await tx.product.findFirstOrThrow({
          where: { sku: line.sku },
          select: { id: true },
        });
        const row = {
          orderId: plan.id,
          productId: product.id,
          quantity: line.quantity,
          price: dec(line.priceKop),
          createdAt: line.createdAt,
        };
        await tx.orderItem.upsert({
          where: { id: line.id },
          update: row,
          create: { id: line.id, ...row },
        });
        for (const addon of line.addons) {
          const service = await tx.addonService.findFirst({
            where: { name: addon.name },
            select: { id: true },
          });
          await tx.orderItemAddon.create({
            data: {
              id: addon.id,
              orderItemId: line.id,
              addonServiceId: service?.id ?? null,
              name: addon.name,
              price: dec(addon.priceKop),
              createdAt: line.createdAt,
            },
          });
        }
      }

      // The promo code's redemption — what checkout's `DiscountService.redeem`
      // writes, with the order phone it always passes.
      if (spec.discountCode && extra.userId) {
        const discount = await tx.discount.findUniqueOrThrow({
          where: { code: spec.discountCode },
          select: { id: true },
        });
        const redemption = {
          discountId: discount.id,
          userId: extra.userId,
          phone: plan.shippingAddress.phone ?? null,
          createdAt: plan.createdAt,
        };
        await tx.discountRedemption.upsert({
          where: { orderId: plan.id },
          update: redemption,
          create: { orderId: plan.id, ...redemption },
        });
      } else {
        await tx.discountRedemption.deleteMany({ where: { orderId: plan.id } });
      }

      // History: append-only in the app, rebuilt here from the plan's timeline.
      await tx.orderStatusHistory.deleteMany({ where: { orderId: plan.id } });
      await tx.orderStatusHistory.createMany({
        data: plan.history.map((row) => ({
          orderId: plan.id,
          changeType: row.changeType,
          fromStatus: row.fromStatus,
          toStatus: row.toStatus,
          fromPaymentStatus: row.fromPaymentStatus,
          toPaymentStatus: row.toPaymentStatus,
          note: row.note,
          changedBy: actorId(row.actor),
          changedAt: row.at,
        })),
      });

      for (const p of plan.payments) {
        await tx.payment.create({
          data: {
            id: p.id,
            orderId: plan.id,
            provider: 'liqpay',
            providerPaymentId: `seed-${spec.key}-${p.id.slice(0, 8)}`,
            amount: dec(p.amountKop),
            currency: 'UAH',
            status: p.status,
            ...(p.status === 'FAILED'
              ? { failureCode: 'card_declined', failureMessage: 'Відхилено банком-емітентом' }
              : {}),
            createdAt: p.createdAt,
            settledAt: p.settledAt,
          },
        });
      }
      for (const e of plan.entries) {
        await tx.orderMoneyEntry.create({
          data: {
            id: e.id,
            orderId: plan.id,
            direction: e.direction,
            kind: e.kind,
            amountKop: e.amountKop,
            paymentId: e.paymentId,
            providerRef: e.providerRef,
            actorId: actorId(e.actor),
            reason: e.reason,
            reversalOfId: e.reversalOfId,
            counterpartOrderId: e.counterpartOrderId,
            occurredAt: e.occurredAt,
            createdAt: e.occurredAt,
          },
        });
      }

      const derived = await money.recompute(tx, plan.id, null);
      if (derived.status !== plan.status || derived.paymentStatus !== plan.paymentStatus) {
        throw new Error(
          `seedOrders: «${spec.key}» — OrderMoneyRepository.recompute derives ` +
            `${derived.status}/${derived.paymentStatus}, the plan says ` +
            `${plan.status}/${plan.paymentStatus}.`,
        );
      }
    },
    { timeout: 60_000 },
  );
}

/**
 * Seed the orders (TASK-2569 / TASK-2563 / TASK-1821): all four delivery
 * methods with a real snapshot, every payment method inside the delivery ×
 * payment matrix, and money that arrived through the ledger — so the dashboard,
 * the reports and the order's money block all have something true to show.
 *
 * Idempotent: deterministic ids for orders, lines, add-ons, attempts and ledger
 * rows; history, ledger, attempts and returns of seeded orders are rebuilt on
 * every run, and every date is re-anchored to now.
 */
export async function seedOrders(prisma: PrismaClient, actors: OrderActors) {
  const { ctx, userIdByEmail } = await buildPlanContext(prisma, orderSpecs);
  const plans = orderSpecs.map((spec) => planOrder(spec, ctx));
  assertOrderSet(orderSpecs, ctx);

  await clearOrderDependants(
    prisma,
    plans.map((p) => p.id),
  );

  let lines = 0;
  let addons = 0;
  let history = 0;
  let entries = 0;
  for (const plan of plans) {
    const userId = plan.spec.email ? userIdByEmail.get(plan.spec.email)! : null;
    await writeOrderPlan(prisma, plan, (actor) => actorIdOf(actor, actors, userId), { userId });
    lines += plan.lines.length;
    addons += plan.lines.reduce((n, l) => n + l.addons.length, 0);
    history += plan.history.length;
    entries += plan.entries.length;
  }

  await syncRedeemedCounts(prisma);

  const methods = new Set(plans.map((p) => p.deliveryMethod)).size;
  console.log(
    `  ✓ Orders: ${plans.length} orders (${methods} delivery methods), ${lines} items, ` +
      `${addons} add-ons, ${history} history rows, ${entries} money entries`,
  );
  return plans;
}

/** The account a symbolic actor stands for on one order. */
export function actorIdOf(
  actor: SeedActor,
  actors: OrderActors,
  customerId: string | null,
): string | null {
  switch (actor) {
    case 'system':
      return null;
    case 'customer':
      return customerId;
    case 'operator':
      return actors.operator.id;
    case 'owner':
      return actors.owner.id;
  }
}

/**
 * `redeemedCount` of every seeded code, recounted from its redemptions — the
 * counter `DiscountService.redeem` increments and a cancel decrements.
 */
export async function syncRedeemedCounts(prisma: PrismaClient) {
  for (const { code } of buildDiscountsData()) {
    const redeemedCount = await prisma.discountRedemption.count({ where: { discount: { code } } });
    await prisma.discount.update({ where: { code }, data: { redeemedCount } });
  }
}
