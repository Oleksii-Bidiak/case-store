import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { ProductImageEntity } from './entities';

/** Fields required to insert a product image row. */
export interface CreateImageInput {
  id: string;
  productId: string;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

/** Fields for updating ordering/primary flag of an existing image. */
export interface UpdateImageInput {
  id: string;
  sortOrder: number;
  isPrimary: boolean;
}

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
   * Update sortOrder + isPrimary for a set of images atomically. The caller is
   * responsible for the at-most-one-primary invariant; this method only persists.
   */
  async updateMany(updates: UpdateImageInput[]): Promise<void> {
    if (updates.length === 0) return;
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.productImage.update({
          where: { id: u.id },
          data: { sortOrder: u.sortOrder, isPrimary: u.isPrimary },
        }),
      ),
    );
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
