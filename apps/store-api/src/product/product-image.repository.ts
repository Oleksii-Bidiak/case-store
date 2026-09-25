import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { ProductImageEntity } from './entities';

/** Fields required to insert a product image row. */
export interface CreateImageInput {
  id: string;
  productId: string;
  url: string;
  alt: string | null;
  /** Base64 LQIP data URI, or null for GIF passthrough / unprocessed uploads. */
  blurDataUrl: string | null;
  sortOrder: number;
  isPrimary: boolean;
  /**
   * PROVENANCE — the media-library asset this row was created from (TASK-441),
   * or null/absent for a direct upload, the seed and the catalogue import.
   *
   * Never read to answer "is that asset still used": that question is settled by
   * matching URLs in `MediaUsageRepository`, precisely because this column is
   * only ever set by the paths that remembered to set it. See the note on
   * `ProductImage.mediaAssetId` in `schema.prisma`.
   */
  mediaAssetId?: string | null;
}

/** Fields for updating ordering/primary flag of an existing image. */
export interface UpdateImageInput {
  id: string;
  sortOrder: number;
  isPrimary: boolean;
}

/** Thrown inside the reorder transaction to roll it back; never leaves the repository. */
class ForeignImageInReorder extends Error {}

/**
 * Encapsulates all Prisma access for the `product_images` table. Returns domain
 * entities, never raw Prisma rows.
 */
@Injectable()
export class ProductImageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** All images for a product, ordered for display (lowest sortOrder first). */
  async findByProductId(productId: string): Promise<ProductImageEntity[]> {
    const rows = await this.prisma.productImage.findMany({
      where: { productId },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ProductImageEntity.fromPrisma(r));
  }

  /** A single image by id, or null. */
  async findById(imageId: string): Promise<ProductImageEntity | null> {
    const row = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    return row ? ProductImageEntity.fromPrisma(row) : null;
  }

  /** Highest sortOrder currently used for a product (-1 when it has no images). */
  async getMaxSortOrder(productId: string): Promise<number> {
    const result = await this.prisma.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    return result._max.sortOrder ?? -1;
  }

  /**
   * Resolve the primary image for each of the given products in a SINGLE query
   * (no N+1). The "primary" image is the one flagged `isPrimary = true`, falling
   * back to the lowest `sortOrder` when no flag is set. Returns a Map keyed by
   * productId; products with no images are absent from the map.
   */
  async findPrimaryByProductIds(productIds: string[]): Promise<Map<string, ProductImageEntity>> {
    if (productIds.length === 0) {
      return new Map();
    }
    // Order so the desired image per product sorts first, then reduce.
    const rows = await this.prisma.productImage.findMany({
      where: { productId: { in: productIds } },
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    });

    const map = new Map<string, ProductImageEntity>();
    for (const row of rows) {
      if (!map.has(row.productId)) {
        map.set(row.productId, ProductImageEntity.fromPrisma(row));
      }
    }
    return map;
  }

  /** Insert a single image row. */
  async create(data: CreateImageInput): Promise<ProductImageEntity> {
    const row = await this.prisma.productImage.create({ data });
    return ProductImageEntity.fromPrisma(row);
  }

  /** Insert several image rows at once. */
  async bulkCreate(data: CreateImageInput[]): Promise<void> {
    if (data.length === 0) return;
    await this.prisma.productImage.createMany({ data });
  }

  /**
   * Persist a gallery reorder for ONE product, atomically (TASK-783). Returns
   * `false` — having written nothing — when any id is not one of this product's
   * images (another product's image, or no image at all); `true` otherwise.
   *
   * - Every update is scoped by `productId`, so a foreign id matches no row
   *   instead of rewriting another product's cover, and an unknown id never
   *   reaches Prisma as a P2025 (`update` on a missing row) that answers 500.
   * - When the payload promotes an image, every other cover of the product is
   *   demoted in the same transaction — a partial payload that does not mention
   *   the current cover cannot leave two. The caller still guarantees the
   *   payload itself promotes at most one image.
   * - The product's gallery rows are locked first (`FOR UPDATE`), so two
   *   concurrent reorders promoting different images serialise: the second one's
   *   demote runs after the first commits and sees its cover. Without the lock,
   *   under READ COMMITTED each demote reads a snapshot where the other's
   *   promotion is not yet visible, and both covers survive.
   */
  async reorderForProduct(productId: string, updates: UpdateImageInput[]): Promise<boolean> {
    if (updates.length === 0) return true;
    const ids = updates.map((u) => u.id);
    const promotes = updates.some((u) => u.isPrimary);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM product_images WHERE product_id = ${productId} FOR UPDATE`;

        if (promotes) {
          await tx.productImage.updateMany({
            where: { productId, isPrimary: true, id: { notIn: ids } },
            data: { isPrimary: false },
          });
        }
        for (const u of updates) {
          const { count } = await tx.productImage.updateMany({
            where: { id: u.id, productId },
            data: { sortOrder: u.sortOrder, isPrimary: u.isPrimary },
          });
          if (count !== 1) throw new ForeignImageInReorder();
        }
      });
      return true;
    } catch (error) {
      if (error instanceof ForeignImageInReorder) return false;
      throw error;
    }
  }

  /**
   * Delete one image, returning the entity (with its url) BEFORE deletion so the
   * caller can remove the underlying file from storage. Returns null if the image
   * does not exist.
   */
  async delete(imageId: string): Promise<ProductImageEntity | null> {
    const existing = await this.prisma.productImage.findUnique({ where: { id: imageId } });
    if (!existing) {
      return null;
    }
    await this.prisma.productImage.delete({ where: { id: imageId } });
    return ProductImageEntity.fromPrisma(existing);
  }
}
