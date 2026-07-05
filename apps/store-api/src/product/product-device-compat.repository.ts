import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/**
 * Public-safe summary of a device model a product is compatible with (TASK-190).
 * Flattened `brandName` so the storefront/admin can label it without a join.
 */
export interface CompatibleDeviceModelSummary {
  id: string;
  name: string;
  slug: string;
  brandName: string;
}

/**
 * ProductDeviceCompatRepository — Prisma access for the Product ↔ DeviceModel
 * compatibility join (TASK-190). Co-located in the `product` module (compat is a
 * property of the position, not a peer aggregate — doc 099 §3), split out of
 * `ProductRepository` following the same file-per-concern convention as
 * `ProductImageRepository`.
 */
@Injectable()
export class ProductDeviceCompatRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Get the compatible device models for a single product (with brand name). */
  async getDeviceCompat(productId: string): Promise<CompatibleDeviceModelSummary[]> {
    const rows = await this.prisma.productDeviceCompat.findMany({
      where: { productId },
      include: { deviceModel: { include: { brand: { select: { name: true } } } } },
    });
    return rows.map((row) => this.toSummary(row.deviceModel));
  }

  /**
   * Batch-load compat models for a set of products (no N+1), keyed by productId.
   * Products with no compat are absent from the map.
   */
  async getDeviceCompatByProductIds(
    productIds: string[],
  ): Promise<Map<string, CompatibleDeviceModelSummary[]>> {
    const map = new Map<string, CompatibleDeviceModelSummary[]>();
    if (productIds.length === 0) {
      return map;
    }
    const rows = await this.prisma.productDeviceCompat.findMany({
      where: { productId: { in: productIds } },
      include: { deviceModel: { include: { brand: { select: { name: true } } } } },
    });
    for (const row of rows) {
      const summary = this.toSummary(row.deviceModel);
      const bucket = map.get(row.productId);
      if (bucket) {
        bucket.push(summary);
      } else {
        map.set(row.productId, [summary]);
      }
    }
    return map;
  }

  /** Just the compatible device-model ids for a product (for cross-sell seeding). */
  async getDeviceModelIds(productId: string): Promise<string[]> {
    const rows = await this.prisma.productDeviceCompat.findMany({
      where: { productId },
      select: { deviceModelId: true },
    });
    return rows.map((r) => r.deviceModelId);
  }

  /**
   * Replace the full compat set for a product in one transaction (delete every
   * existing row, insert the new set). Never leaves a partial state on error.
   */
  async setDeviceCompat(productId: string, deviceModelIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(deviceModelIds)];
    await this.prisma.$transaction([
      this.prisma.productDeviceCompat.deleteMany({ where: { productId } }),
      ...(uniqueIds.length > 0
        ? [
            this.prisma.productDeviceCompat.createMany({
              data: uniqueIds.map((deviceModelId) => ({ productId, deviceModelId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  /**
   * Apply the same compat set to every position sharing `groupId` (the bulk admin
   * action — doc 099 §3). Returns the number of positions updated. Runs the
   * per-position delete+insert inside a single transaction.
   */
  async setDeviceCompatForGroup(
    groupId: string,
    deviceModelIds: string[],
  ): Promise<{ updatedCount: number; productIds: string[] }> {
    const uniqueIds = [...new Set(deviceModelIds)];
    const positions = await this.prisma.product.findMany({
      where: { groupId, deletedAt: null },
      select: { id: true },
    });
    const productIds = positions.map((p) => p.id);
    if (productIds.length === 0) {
      return { updatedCount: 0, productIds: [] };
    }
    await this.prisma.$transaction([
      this.prisma.productDeviceCompat.deleteMany({ where: { productId: { in: productIds } } }),
      ...(uniqueIds.length > 0
        ? [
            this.prisma.productDeviceCompat.createMany({
              data: productIds.flatMap((productId) =>
                uniqueIds.map((deviceModelId) => ({ productId, deviceModelId })),
              ),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    return { updatedCount: productIds.length, productIds };
  }

  /** Count non-deleted positions in a group (to validate the bulk action). */
  async countGroupPositions(groupId: string): Promise<number> {
    return this.prisma.product.count({ where: { groupId, deletedAt: null } });
  }

  private toSummary(model: {
    id: string;
    name: string;
    slug: string;
    brand: { name: string };
  }): CompatibleDeviceModelSummary {
    return { id: model.id, name: model.name, slug: model.slug, brandName: model.brand.name };
  }
}
