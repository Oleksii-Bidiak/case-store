import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * The public fields of a pickup point (TASK-643) — what the checkout shows and
 * what an order snapshots. `isActive`, `sortOrder` and the timestamps are the
 * shop's bookkeeping and never leave this repository on the read paths below.
 */
export const PICKUP_POINT_SELECT = {
  id: true,
  name: true,
  city: true,
  address: true,
  phone: true,
  workingHours: true,
  mapUrl: true,
} as const satisfies Prisma.PickupPointSelect;

/** A pickup point as the domain sees it (not the raw Prisma row). */
export type PickupPoint = Prisma.PickupPointGetPayload<{ select: typeof PICKUP_POINT_SELECT }>;

/**
 * PickupPointRepository — the only place that reads `pickup_points` (plan 184,
 * B-6 §1). `DeliveryService` depends on this, never on `PrismaClient`.
 *
 * Only ACTIVE points are readable here: `isActive` is the reversible visibility
 * toggle, and a deactivated point must vanish from checkout while the orders that
 * already reference it keep their snapshot of its name and address.
 */
@Injectable()
export class PickupPointRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Active points in the order the owner arranged them; `name` then `createdAt`
   * break ties so two points left at the default `sortOrder` still list stably.
   */
  findActive(): Promise<PickupPoint[]> {
    return this.prisma.pickupPoint.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { createdAt: 'asc' }],
      select: PICKUP_POINT_SELECT,
    });
  }

  /** One active point, or null when it does not exist or has been deactivated. */
  findActiveById(id: string): Promise<PickupPoint | null> {
    return this.prisma.pickupPoint.findFirst({
      where: { id, isActive: true },
      select: PICKUP_POINT_SELECT,
    });
  }
}
