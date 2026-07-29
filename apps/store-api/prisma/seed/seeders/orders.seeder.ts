import { PrismaClient } from '@prisma/client';
import { cataloguePositions } from '../data/catalogue';
import { orderSpecs, paymentOffsetHours, statusOffsetHours } from '../data/orders.data';
import { deterministicUuid } from '../lib/ids';
import type { OrderStatus, PaymentStatus, SeededUser } from '../types';

/**
 * Check EVERY line item before writing anything, and report all the problems in
 * one message.
 *
 * The point is the "all at once" part. Resolving SKUs lazily inside the write
 * loop threw on the first miss, so re-pointing this file at a new catalogue
 * (TASK-366 replaced the whole assortment) meant one seed run per broken SKU —
 * eleven runs to discover eleven renames, each one a minute of rebuilding
 * everything upstream of orders. It also left the database half-seeded each
 * time.
 *
 * Out-of-stock is an error too, not just unknown. A seeded order whose item the
 * storefront shows as «Немає в наявності» is a demo that contradicts itself —
 * the reviewer clicks through from the order to a product they cannot buy. Real
 * shops do sell their last unit, so this is a rule about demo data rather than
 * about orders; if a future scenario deliberately needs a sold-out line item,
 * this is the one place to relax.
 */
function assertOrderSkusResolve(bySku: Map<string, { id: string; price: number }>) {
  const stockBySku = new Map(cataloguePositions().map((p) => [p.sku, p.stock]));
  const unknown: string[] = [];
  const soldOut: string[] = [];

  for (const sku of new Set(orderSpecs.flatMap((spec) => spec.items.map((i) => i.sku)))) {
    if (!bySku.has(sku)) unknown.push(sku);
    else if (stockBySku.get(sku) === 0) soldOut.push(sku);
  }

  const problems = [
    unknown.length && `unknown SKU(s): ${unknown.sort().join(', ')}`,
    soldOut.length && `out-of-stock SKU(s): ${soldOut.sort().join(', ')}`,
  ].filter(Boolean);

  if (problems.length) {
    throw new Error(
      `seedOrders: orders.data.ts does not match the catalogue — ${problems.join('; ')}. ` +
        'Every order line must name a SKU that data/catalogue/** actually creates, with stock > 0.',
    );
  }
}

/**
 * Seed a spread of orders (TASK-020/028/251) covering EVERY OrderStatus and
 * EVERY PaymentStatus, with 1–4 line items each (price captured at purchase),
 * computed money fields, UA shipping addresses, a couple of discount redemptions,
 * and a realistic append-only OrderStatusHistory trail per order. Deterministic
 * ids keyed on the order key make the whole thing idempotent; the item list and
 * history trail are deleted + recreated wholesale each run.
 */
export async function seedOrders(
  prisma: PrismaClient,
  admins: { id: string }[],
  customers: SeededUser[],
) {
  const money = (n: number) => Math.round(n * 100) / 100;
  const customerByEmail = new Map(customers.map((c) => [c.email, c]));

  // Recipient names for the shipping-address JSON.
  const userRecords = await prisma.user.findMany({
    where: { id: { in: customers.map((c) => c.id) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(
    userRecords.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()]),
  );

  // sku → { id, price } for every seeded product position.
  const products = await prisma.product.findMany({ select: { id: true, sku: true, price: true } });
  const bySku = new Map(
    products
      .filter((p): p is { id: string; sku: string; price: (typeof p)['price'] } => p.sku !== null)
      .map((p) => [p.sku, { id: p.id, price: Number(p.price) }]),
  );

  // code → { id } for discounts used by the orders below.
  const discounts = await prisma.discount.findMany({ select: { id: true, code: true } });
  const discountByCode = new Map(discounts.map((d) => [d.code, d.id]));

  assertOrderSkusResolve(bySku);

  const hour = 60 * 60 * 1000;
  const redemptionCountByCode = new Map<string, number>();
  let orderCount = 0;
  let itemCount = 0;
  let historyCount = 0;

  for (const spec of orderSpecs) {
    const customer = customerByEmail.get(spec.email);
    if (!customer) throw new Error(`seedOrders: unknown customer ${spec.email}`);

    const orderId = deterministicUuid(`order-${spec.key}`);
    const createdAt = new Date(Date.now() - spec.daysAgo * 24 * hour);

    // Resolve line items + capture price at purchase.
    const items = spec.items.map((line) => {
      const product = bySku.get(line.sku);
      if (!product) throw new Error(`seedOrders: unknown product sku ${line.sku}`);
      return { productId: product.id, quantity: line.quantity, price: product.price };
    });

    const subtotal = money(items.reduce((sum, it) => sum + it.price * it.quantity, 0));

    let discount = 0;
    if (spec.discountCode === 'WELCOME10') discount = money(subtotal * 0.1);
    else if (spec.discountCode === 'SUMMER500') discount = money(Math.min(500, subtotal));

    const shippingCost = subtotal - discount >= 2000 ? 0 : 90;
    const tax = 0;
    const total = money(subtotal - discount + shippingCost + tax);

    const orderData = {
      userId: customer.id,
      status: spec.status,
      paymentStatus: spec.paymentStatus,
      subtotal,
      discount,
      discountCode: spec.discountCode ?? null,
      shippingCost,
      tax,
      total,
      shippingAddress: {
        recipient: nameById.get(customer.id) ?? spec.email,
        city: spec.city,
        warehouse: spec.warehouse,
        carrier: 'Нова Пошта',
      },
      notes: spec.notes ?? null,
    };

    await prisma.order.upsert({
      where: { id: orderId },
      update: orderData,
      create: { id: orderId, createdAt, ...orderData },
    });
    orderCount++;

    // Line items — replace wholesale for idempotency.
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.orderItem.createMany({
      data: items.map((it) => ({
        orderId,
        productId: it.productId,
        quantity: it.quantity,
        price: it.price,
      })),
    });
    itemCount += items.length;

    // Discount redemption (unique on orderId → idempotent upsert).
    if (spec.discountCode) {
      const discountId = discountByCode.get(spec.discountCode);
      if (discountId) {
        await prisma.discountRedemption.upsert({
          where: { orderId },
          update: {},
          create: { discountId, userId: customer.id, orderId },
        });
        redemptionCountByCode.set(
          spec.discountCode,
          (redemptionCountByCode.get(spec.discountCode) ?? 0) + 1,
        );
      }
    }

    // Append-only status history — delete + rebuild the trail each run.
    await prisma.orderStatusHistory.deleteMany({ where: { orderId } });

    const adminId = admins[orderCount % admins.length].id;
    interface HistoryRow {
      offset: number;
      changeType: 'STATUS' | 'PAYMENT_STATUS';
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus | null;
      fromPaymentStatus: PaymentStatus | null;
      toPaymentStatus: PaymentStatus | null;
      changedBy: string | null;
    }
    const rows: HistoryRow[] = [];

    // STATUS rows: initial null→PENDING is system (null); later transitions are
    // admin-driven, except a customer self-cancel.
    for (let i = 0; i < spec.statusFlow.length; i++) {
      const to = spec.statusFlow[i];
      const from = i === 0 ? null : spec.statusFlow[i - 1];
      let changedBy: string | null;
      if (i === 0) changedBy = null;
      else if (to === 'CANCELLED' && spec.selfCancel) changedBy = customer.id;
      else changedBy = adminId;
      rows.push({
        offset: statusOffsetHours[to],
        changeType: 'STATUS',
        fromStatus: from,
        toStatus: to,
        fromPaymentStatus: null,
        toPaymentStatus: null,
        changedBy,
      });
    }

    // PAYMENT_STATUS rows: PENDING→PAID and →FAILED are system/webhook (null);
    // →REFUNDED is an admin action.
    for (let i = 1; i < spec.paymentFlow.length; i++) {
      const to = spec.paymentFlow[i];
      const from = spec.paymentFlow[i - 1];
      rows.push({
        offset: paymentOffsetHours[to],
        changeType: 'PAYMENT_STATUS',
        fromStatus: null,
        toStatus: null,
        fromPaymentStatus: from,
        toPaymentStatus: to,
        changedBy: to === 'REFUNDED' ? adminId : null,
      });
    }

    rows.sort((a, b) => a.offset - b.offset);
    for (const row of rows) {
      await prisma.orderStatusHistory.create({
        data: {
          orderId,
          changeType: row.changeType,
          fromStatus: row.fromStatus,
          toStatus: row.toStatus,
          fromPaymentStatus: row.fromPaymentStatus,
          toPaymentStatus: row.toPaymentStatus,
          changedBy: row.changedBy,
          changedAt: new Date(createdAt.getTime() + row.offset * hour),
        },
      });
      historyCount++;
    }
  }

  // Sync redeemedCount on the discounts actually redeemed above (keeps the admin
  // discount list consistent with the seeded redemptions; idempotent).
  for (const [code, count] of redemptionCountByCode) {
    await prisma.discount.update({ where: { code }, data: { redeemedCount: count } });
  }

  console.log(`  ✓ Orders: ${orderCount} orders, ${itemCount} items, ${historyCount} history rows`);
}
