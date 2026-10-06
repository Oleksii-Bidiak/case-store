import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { ReorderTx, acquireAdvisoryLocks, lockKey, reorderBucket } from '../common/reorder';

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
 * The admin's view of a point (TASK-645): the public fields plus the bookkeeping
 * the settings screen edits, and how many orders reference the point — the
 * number the operator needs before choosing between "deactivate" and "delete".
 *
 * The count is every order holding the FK, tombstoned ones included: it answers
 * "what does deleting this touch", and a tombstoned order is touched too.
 */
export const ADMIN_PICKUP_POINT_SELECT = {
  ...PICKUP_POINT_SELECT,
  isActive: true,
  sortOrder: true,
  _count: { select: { orders: true } },
} as const satisfies Prisma.PickupPointSelect;

type AdminPickupPointRow = Prisma.PickupPointGetPayload<{
  select: typeof ADMIN_PICKUP_POINT_SELECT;
}>;

/** A pickup point as the admin screen sees it (TASK-645) — a domain object, no `_count`. */
export interface AdminPickupPoint extends PickupPoint {
  isActive: boolean;
  sortOrder: number;
  /** Orders that reference this point (and would lose the FK on delete). */
  ordersCount: number;
}

/** Fields of a new point. `sortOrder` is never accepted — a new point is appended. */
export interface CreatePickupPointInput {
  name: string;
  city: string;
  address: string;
  phone?: string | null;
  workingHours?: string | null;
  mapUrl?: string | null;
  isActive?: boolean;
}

/** A partial update: only the fields present are written. */
export type UpdatePickupPointInput = Partial<CreatePickupPointInput>;

/**
 * Advisory-lock namespace for the pickup-point list (TASK-645). MANDATORY prefix:
 * advisory locks are DATABASE-GLOBAL.
 */
const LOCK_RESOURCE = 'pickup-points';

/** The shop's points are ONE list — a single bucket, hence the `null` bucket key. */
const PICKUP_POINTS_LOCK_KEY = lockKey(LOCK_RESOURCE, null);

/** Display order everywhere: the owner's order, then name, then age, so ties list stably. */
const LIST_ORDER: Prisma.PickupPointOrderByWithRelationInput[] = [
  { sortOrder: 'asc' },
  { name: 'asc' },
  { createdAt: 'asc' },
];

/** Any client the reads accept: the injected singleton or an interactive-transaction client. */
type PickupPointDbClient = PrismaService | ReorderTx;

/**
 * PickupPointRepository — the only place that reads `pickup_points` (plan 184,
 * B-6 §1). `DeliveryService` and `PickupPointService` depend on this, never on
 * `PrismaClient`.
 *
 * The CHECKOUT reads (`findActive`, `findActiveById`) see ACTIVE points only:
 * `isActive` is the reversible visibility toggle, and a deactivated point must
 * vanish from checkout while the orders that already reference it keep their
 * snapshot of its name and address. The ADMIN reads see every point.
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
      orderBy: LIST_ORDER,
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

  // ─── Admin (TASK-645) ──────────────────────────────────────────────────────

  /** Every point, inactive included, in display order. */
  async listAll(client: PickupPointDbClient = this.prisma): Promise<AdminPickupPoint[]> {
    const rows = await client.pickupPoint.findMany({
      orderBy: LIST_ORDER,
      select: ADMIN_PICKUP_POINT_SELECT,
    });
    return rows.map(toAdminPickupPoint);
  }

  /** One point whatever its status, or null for an unknown id. */
  async findById(id: string): Promise<AdminPickupPoint | null> {
    const row = await this.prisma.pickupPoint.findUnique({
      where: { id },
      select: ADMIN_PICKUP_POINT_SELECT,
    });
    return row ? toAdminPickupPoint(row) : null;
  }

  /**
   * Create a point APPENDED to the end of the list (`max(sortOrder) + 1`, 0 for
   * the first). The max read runs inside a transaction holding the list's
   * advisory lock — the FAQ recipe (TASK-428) — so two concurrent creates cannot
   * be handed one slot, and a create cannot slip under a running reorder.
   *
   * Optional fields absent from the input are written as null explicitly, and a
   * point is active unless told otherwise.
   */
  create(input: CreatePickupPointInput): Promise<AdminPickupPoint> {
    return this.prisma.$transaction(async (tx) => {
      await acquireAdvisoryLocks(tx, [PICKUP_POINTS_LOCK_KEY]);

      const { _max } = await tx.pickupPoint.aggregate({ _max: { sortOrder: true } });
      const sortOrder = _max.sortOrder === null ? 0 : _max.sortOrder + 1;

      const row = await tx.pickupPoint.create({
        data: {
          name: input.name,
          city: input.city,
          address: input.address,
          phone: input.phone ?? null,
          workingHours: input.workingHours ?? null,
          mapUrl: input.mapUrl ?? null,
          isActive: input.isActive ?? true,
          sortOrder,
        },
        select: ADMIN_PICKUP_POINT_SELECT,
      });
      return toAdminPickupPoint(row);
    });
  }

  /** Write only the provided fields. A vanished row surfaces as Prisma P2025 → 404. */
  async update(id: string, input: UpdatePickupPointInput): Promise<AdminPickupPoint> {
    const row = await this.prisma.pickupPoint.update({
      where: { id },
      data: input,
      select: ADMIN_PICKUP_POINT_SELECT,
    });
    return toAdminPickupPoint(row);
  }

  /**
   * Hard delete. `Order.pickupPointId` is `onDelete: SetNull`, and every PICKUP
   * order carries the point's name and address in its `shippingAddress`
   * snapshot, so no order loses what it said at checkout. `deletedAt` is not a
   * thing here by design (plan 184, TASK-642): only User/Product/Order tombstone.
   */
  async delete(id: string): Promise<void> {
    await this.prisma.pickupPoint.delete({ where: { id } });
  }

  /**
   * Rewrite the complete ordering of the list and return the refreshed admin
   * list, read inside the same transaction. Throws the domain errors of
   * `common/reorder/reorder.errors.ts`; the service maps them.
   *
   * The snapshot selects `sortOrder` alongside `id`, so points nobody moved are
   * not rewritten (and their `updatedAt` is not re-stamped) — TASK-429.
   */
  reorderAll(orderedIds: readonly string[]): Promise<AdminPickupPoint[]> {
    return reorderBucket<AdminPickupPoint[]>(this.prisma, {
      resource: LOCK_RESOURCE,
      bucket: null,
      orderedIds,
      snapshot: (tx) => tx.pickupPoint.findMany({ select: { id: true, sortOrder: true } }),
      delegate: (tx) => tx.pickupPoint,
      result: (tx) => this.listAll(tx),
    });
  }
}

/** Flatten Prisma's `_count` into the domain's `ordersCount`. */
function toAdminPickupPoint(row: AdminPickupPointRow): AdminPickupPoint {
  const { _count, ...rest } = row;
  return { ...rest, ordersCount: _count.orders };
}
