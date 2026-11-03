import { DeliveryMethod } from '@prisma/client';
import type { AddressDto } from './dto/address.dto';
import type { ShippingAddressData } from './order.types';

/**
 * The persisted delivery snapshot (`Order.shippingAddress` JSON) — built in ONE
 * place for every writer: the storefront checkout (TASK-643), the operator's
 * phone order (TASK-1973) and the operator's delivery edit (TASK-1020/1806).
 *
 * Pure on purpose: no NestJS, no Prisma client. The callers decide the method,
 * the point and the price; this file only says what the stored object looks
 * like for that decision, so the three writers cannot drift apart.
 */

/** A pickup point as frozen into an order (TASK-643 / TASK-647). */
export interface PickupPointSnapshot {
  name: string;
  city: string;
  address: string;
  hours: string | null;
  phone: string | null;
  mapUrl: string | null;
}

/** The keys the snapshot adds on top of the typed address. */
const SNAPSHOT_KEYS = [
  'deliveryMethod',
  'carrier',
  'shippingCostPending',
  'pickupPointName',
  'pickupPointAddress',
  'pickupPointHours',
  'pickupPointPhone',
  'pickupPointMapUrl',
] as const satisfies ReadonlyArray<keyof ShippingAddressData>;

/** The point row (`PickupPointRepository`) in its frozen shape. */
export function pickupPointSnapshot(point: {
  name: string;
  city: string;
  address: string;
  workingHours?: string | null;
  phone?: string | null;
  mapUrl?: string | null;
}): PickupPointSnapshot {
  return {
    name: point.name,
    city: point.city,
    address: point.address,
    hours: point.workingHours ?? null,
    phone: point.phone ?? null,
    mapUrl: point.mapUrl ?? null,
  };
}

/**
 * The point an EXISTING pickup snapshot froze, or null when it froze none (a
 * pre-TASK-643 order). Read back so an operator's contact edit keeps the point
 * the buyer was promised (TASK-1020) instead of looking it up again — the point
 * may have been edited or switched off since.
 */
export function pickupPointFromSnapshot(
  snapshot: Partial<ShippingAddressData>,
): PickupPointSnapshot | null {
  if (!snapshot.pickupPointName) return null;
  return {
    name: snapshot.pickupPointName,
    city: snapshot.city ?? '',
    address: snapshot.pickupPointAddress ?? snapshot.address1 ?? '',
    hours: snapshot.pickupPointHours ?? null,
    phone: snapshot.pickupPointPhone ?? null,
    mapUrl: snapshot.pickupPointMapUrl ?? null,
  };
}

/**
 * A copy of the typed address without the Nova Poshta refs (TASK-643). Used for
 * every non-NP method: an `npCityRef` on a courier order would make any reader
 * that recognises NP parcels by that ref (the TASK-642 backfill rule, the admin
 * card) treat it as one.
 */
export function withoutNpRefs(
  address: AddressDto | Partial<ShippingAddressData>,
): ShippingAddressData {
  const copy = { ...address } as ShippingAddressData;
  delete copy.npCityRef;
  delete copy.npWarehouseName;
  delete copy.npWarehouseRef;
  return copy;
}

/**
 * The snapshot for `method`. Every snapshot key of `address` is dropped first,
 * so a stale one (a pickup point on what is now an NP order, a «to be quoted»
 * flag on a priced one) can never survive a rebuild.
 *
 * - NOVA_POSHTA → the address with its refs, `carrier: 'NOVA_POSHTA'`.
 * - PICKUP → the point's city and address win over whatever was typed (the
 *   parcel is collected THERE), plus the frozen point fields.
 * - COURIER / OTHER → no NP refs, `carrier: null`; `shippingCostPending` only
 *   when asked for, i.e. an OTHER whose cost is still to be quoted (B-6 §4).
 */
export function buildDeliverySnapshot(
  address: AddressDto | Partial<ShippingAddressData>,
  method: DeliveryMethod,
  options: { point?: PickupPointSnapshot | null; shippingCostPending?: boolean } = {},
): ShippingAddressData {
  const base = { ...address } as ShippingAddressData;
  for (const key of SNAPSHOT_KEYS) delete base[key];

  if (method === DeliveryMethod.NOVA_POSHTA) {
    return { ...base, deliveryMethod: method, carrier: 'NOVA_POSHTA' };
  }

  const plain = withoutNpRefs(base);

  if (method === DeliveryMethod.PICKUP && options.point) {
    const point = options.point;
    return {
      ...plain,
      city: point.city,
      address1: point.address,
      deliveryMethod: method,
      carrier: null,
      pickupPointName: point.name,
      pickupPointAddress: point.address,
      pickupPointHours: point.hours,
      pickupPointPhone: point.phone,
      pickupPointMapUrl: point.mapUrl,
    };
  }

  return {
    ...plain,
    deliveryMethod: method,
    carrier: null,
    ...(method === DeliveryMethod.OTHER && options.shippingCostPending
      ? { shippingCostPending: true }
      : {}),
  };
}
