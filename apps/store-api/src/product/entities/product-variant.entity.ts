/**
 * Domain entity representing a product variant.
 *
 * This is a clean domain entity — not a Prisma model.
 * Decimal fields (price) are converted to strings
 * to avoid floating-point precision issues in JSON serialization.
 */
export class ProductVariantEntity {
  id!: string;
  name!: string;
  sku!: string | null;
  price!: string;
  stock!: number;
  attributes!: unknown;
  isActive!: boolean;

  /**
   * Create a ProductVariantEntity from a Prisma product variant.
   * Converts Decimal price to string and strips out relation fields.
   */
  static fromPrisma(variant: {
    id: string;
    name: string;
    sku: string | null;
    price: { toString(): string };
    stock: number;
    attributes: unknown;
    isActive: boolean;
  }): ProductVariantEntity {
    const entity = new ProductVariantEntity();
    entity.id = variant.id;
    entity.name = variant.name;
    entity.sku = variant.sku;
    entity.price = variant.price.toString();
    entity.stock = variant.stock;
    entity.attributes = variant.attributes;
    entity.isActive = variant.isActive;
    return entity;
  }
}
