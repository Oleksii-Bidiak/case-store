/**
 * Domain entity representing a product image.
 *
 * This is a clean domain entity — not a Prisma model.
 * Contains only the data that should be exposed to the client.
 */
export class ProductImageEntity {
  id!: string;
  url!: string;
  alt!: string | null;
  sortOrder!: number;

  /**
   * Create a ProductImageEntity from a Prisma product image.
   */
  static fromPrisma(image: {
    id: string;
    url: string;
    alt: string | null;
    sortOrder: number;
  }): ProductImageEntity {
    const entity = new ProductImageEntity();
    entity.id = image.id;
    entity.url = image.url;
    entity.alt = image.alt;
    entity.sortOrder = image.sortOrder;
    return entity;
  }
}
