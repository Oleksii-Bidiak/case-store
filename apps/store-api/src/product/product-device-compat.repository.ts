import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma';
import { PUBLIC_PRODUCT_WHERE, publicProductSql } from './product-visibility';

/** Recursion guard for the category rollup — the same bound the device hub uses. */
const COVERAGE_MAX_CATEGORY_DEPTH = 50;

/** One cell of the coverage matrix (TASK-1955); zero cells are not returned. */
export interface RootCategoryModelCount {
  rootCategoryId: string;
  deviceModelId: string;
  productCount: number;
}

/** Every (product, model) pair of the cross product. */
function crossPairs(
  productIds: string[],
  deviceModelIds: string[],
): Array<{ productId: string; deviceModelId: string }> {
  return productIds.flatMap((productId) =>
    deviceModelIds.map((deviceModelId) => ({ productId, deviceModelId })),
  );
}

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
 * A group position touched by the bulk compat write (TASK-826): enough for the
 * service to evict both detail cache keys and to index or de-index it.
 */
export interface GroupCompatPosition {
  id: string;
  slug: string;
  isActive: boolean;
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

  /**
   * Just the compatible device-model IDS for a whole page of products, in ONE
   * query (TASK-1953): the storefront compares them with the shopper's own
   * device («підходить / ні») on the client, so a list card needs the ids and
   * nothing else — no model/brand join. Every requested id is present in the
   * map; a product with no compat maps to `[]`.
   */
  async getDeviceModelIdsByProductIds(productIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>(productIds.map((id) => [id, []]));
    if (productIds.length === 0) {
      return map;
    }
    const rows = await this.prisma.productDeviceCompat.findMany({
      where: { productId: { in: [...new Set(productIds)] } },
      select: { productId: true, deviceModelId: true },
      // Deterministic order, so a cached page never differs from a fresh one.
      orderBy: { deviceModelId: 'asc' },
    });
    for (const row of rows) {
      map.get(row.productId)?.push(row.deviceModelId);
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
   * action — doc 099 §3). Returns the number of positions updated and each
   * position's `id`, `slug` and `isActive` — the caller needs the slug to evict
   * the public (slug-keyed) detail cache and the real `isActive` to index or
   * de-index each position (TASK-826). Runs the per-position delete+insert inside
   * a single transaction.
   */
  async setDeviceCompatForGroup(
    groupId: string,
    deviceModelIds: string[],
  ): Promise<{ updatedCount: number; positions: GroupCompatPosition[] }> {
    const uniqueIds = [...new Set(deviceModelIds)];
    const positions = await this.prisma.product.findMany({
      where: { groupId, deletedAt: null },
      select: { id: true, slug: true, isActive: true },
    });
    const productIds = positions.map((p) => p.id);
    if (productIds.length === 0) {
      return { updatedCount: 0, positions: [] };
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
    return { updatedCount: productIds.length, positions };
  }

  // ─── Bulk compat (TASK-1955) ──────────────────────────────────────────────

  /**
   * The non-deleted products among `productIds`, with what the cache eviction and
   * the search sync need. Ids that name nothing (or a tombstone) are absent — the
   * caller diffs against the request to reject them.
   */
  findLiveProducts(productIds: string[]): Promise<GroupCompatPosition[]> {
    if (productIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, slug: true, isActive: true },
    });
  }

  /** The current compat set of every product in `productIds` (absent = none). */
  async getModelIdSetsByProductIds(productIds: string[]): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (productIds.length === 0) {
      return map;
    }
    const rows = await this.prisma.productDeviceCompat.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, deviceModelId: true },
    });
    for (const row of rows) {
      const bucket = map.get(row.productId);
      if (bucket) {
        bucket.add(row.deviceModelId);
      } else {
        map.set(row.productId, new Set([row.deviceModelId]));
      }
    }
    return map;
  }

  /** Link every product to every model; existing links are kept. Returns links created. */
  async addCompat(productIds: string[], deviceModelIds: string[]): Promise<number> {
    if (productIds.length === 0 || deviceModelIds.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.productDeviceCompat.createMany({
      data: crossPairs(productIds, deviceModelIds),
      skipDuplicates: true,
    });
    return count;
  }

  /** Unlink exactly these models from these products. Returns links removed. */
  async removeCompat(productIds: string[], deviceModelIds: string[]): Promise<number> {
    if (productIds.length === 0 || deviceModelIds.length === 0) {
      return 0;
    }
    const { count } = await this.prisma.productDeviceCompat.deleteMany({
      where: { productId: { in: productIds }, deviceModelId: { in: deviceModelIds } },
    });
    return count;
  }

  /**
   * Make `deviceModelIds` the WHOLE compat set of every product, in ONE transaction:
   * drop every link outside the new set, then add the missing ones. Rows that stay
   * are never touched, so `removed`/`added` count real changes, not a delete-all +
   * re-insert of the same pairs.
   */
  async replaceCompat(
    productIds: string[],
    deviceModelIds: string[],
  ): Promise<{ added: number; removed: number }> {
    if (productIds.length === 0) {
      return { added: 0, removed: 0 };
    }
    const [deleted, created] = await this.prisma.$transaction([
      this.prisma.productDeviceCompat.deleteMany({
        where: { productId: { in: productIds }, deviceModelId: { notIn: deviceModelIds } },
      }),
      this.prisma.productDeviceCompat.createMany({
        data: crossPairs(productIds, deviceModelIds),
        skipDuplicates: true,
      }),
    ]);
    return { added: created.count, removed: deleted.count };
  }

  // ─── Model coverage (TASK-1955) ───────────────────────────────────────────

  /**
   * Visible products per (top-level category, model) for the given models — the
   * matrix of the admin coverage page. The rollup is the storefront hub's
   * ({@link CatalogLandingRepository.findDeviceHubRows}): each product counts once
   * under the root of its category, and only products a shopper can see count
   * ({@link publicProductSql}). Pairs with zero products are absent.
   */
  async countByRootCategory(deviceModelIds: string[]): Promise<RootCategoryModelCount[]> {
    if (deviceModelIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ rootCategoryId: string; deviceModelId: string; productCount: number | bigint }>
    >(Prisma.sql`
      WITH RECURSIVE roots AS (
        SELECT c.id, c.id AS root_id, 0 AS depth
        FROM categories c
        WHERE c.parent_id IS NULL
        UNION ALL
        SELECT c.id, r.root_id, r.depth + 1
        FROM categories c
        JOIN roots r ON c.parent_id = r.id
        WHERE r.depth < ${COVERAGE_MAX_CATEGORY_DEPTH}
      )
      SELECT r.root_id AS "rootCategoryId",
             pdc.device_model_id AS "deviceModelId",
             COUNT(DISTINCT p.id)::int AS "productCount"
      FROM product_device_compat pdc
      JOIN products p ON p.id = pdc.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN roots r ON r.id = p.category_id
      WHERE pdc.device_model_id IN (${Prisma.join(deviceModelIds)})
        AND ${publicProductSql({ product: 'p', category: 'c' })}
      GROUP BY r.root_id, pdc.device_model_id
    `);
    return rows.map((row) => ({
      rootCategoryId: row.rootCategoryId,
      deviceModelId: row.deviceModelId,
      productCount: Number(row.productCount),
    }));
  }

  /** Visible products compatible with the model, and how many of them are in stock. */
  async countModelProducts(
    deviceModelId: string,
  ): Promise<{ compatibleProducts: number; inStockProducts: number }> {
    const where = {
      ...PUBLIC_PRODUCT_WHERE,
      deviceCompat: { some: { deviceModelId } },
    } satisfies Prisma.ProductWhereInput;
    const [compatibleProducts, inStockProducts] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.count({ where: { ...where, stock: { gt: 0 } } }),
    ]);
    return { compatibleProducts, inStockProducts };
  }

  /**
   * Active products whose name contains `needle` (case-insensitive) and that have
   * NO compat row for the model — candidates for «Можливо, забули позначити». The
   * caller narrows further (a «15 Pro» needle also hits «15 Pro Max»), so this
   * returns up to `limit` raw candidates, by name.
   */
  findNameCandidatesWithoutModel(
    needle: string,
    deviceModelId: string,
    limit: number,
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    return this.prisma.product.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        name: { contains: needle, mode: 'insensitive' },
        deviceCompat: { none: { deviceModelId } },
      },
      select: { id: true, name: true, slug: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit,
    });
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
