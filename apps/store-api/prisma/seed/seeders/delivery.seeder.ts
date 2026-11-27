import { PrismaClient } from '@prisma/client';
import { SINGLETON_ID } from '../../../src/delivery/delivery.repository';
import { COURIER_SETTINGS, pickupPointsData } from '../data/delivery.data';
import { deterministicUuid } from '../lib/ids';

/** The id a seeded pickup point carries — stable across runs (TASK-2569). */
export function pickupPointId(key: string): string {
  return deterministicUuid(`pickup-point-${key}`);
}

/**
 * Delivery settings and pickup points (TASK-2569).
 *
 * The seeded orders use all four delivery methods, and checkout refuses a method
 * the shop has switched off (`OrderService.checkDeliveryChoice`) — `pickupEnabled`
 * and `courierEnabled` default to false, so without this row a pickup or courier
 * order in the seed would be one the storefront could never have placed.
 *
 * The singleton is upserted by its well-known id. On update only the fields the
 * seed owns are written (the four method switches and the courier terms the
 * seeded orders are priced with); the Nova Poshta sender block is the operator's
 * and is left alone. Pickup points are upserted by deterministic id, so a second
 * run rewrites the same three rows.
 */
export async function seedDelivery(prisma: PrismaClient) {
  const owned = {
    npEnabled: true,
    pickupEnabled: true,
    courierEnabled: true,
    otherEnabled: true,
    courierCityName: COURIER_SETTINGS.cityName,
    courierPrice: COURIER_SETTINGS.price,
    courierFreeFrom: COURIER_SETTINGS.freeFrom,
  };
  await prisma.deliverySetting.upsert({
    where: { id: SINGLETON_ID },
    update: owned,
    create: { id: SINGLETON_ID, ...owned },
  });

  const points: Record<string, { id: string; isActive: boolean }> = {};
  for (const { key, ...point } of pickupPointsData) {
    const id = pickupPointId(key);
    const record = await prisma.pickupPoint.upsert({
      where: { id },
      update: point,
      create: { id, ...point },
    });
    points[key] = record;
  }

  const active = pickupPointsData.filter((p) => p.isActive).length;
  console.log(
    `  ✓ Delivery: all 4 methods on, courier ${COURIER_SETTINGS.price} грн ` +
      `(free from ${COURIER_SETTINGS.freeFrom}); pickup points: ${active} active, ` +
      `${pickupPointsData.length - active} inactive`,
  );
  return points;
}
