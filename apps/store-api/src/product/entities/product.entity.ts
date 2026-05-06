/**
 * Domain entity representing a product.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by ProductService methods and contains only
 * the data that should be exposed to the client.
 *
 * Decimal fields (price, compareAtPrice) are converted to strings
 * to avoid floating-point precision issues in JSON serialization.
 * Relation fields (variants, images, reviews, orderItems, cartItems)
 * are EXCLUDED from the base entity.
 */
export class ProductEntity {
  id!: string;
  name!: string;
  slug!: string;
  description!: string | null;
  price!: string;
  compareAtPrice!: string | null;
  sku!: string | null;
  categoryId!: string;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;

  /**
   * Create a ProductEntity from a Prisma Product model.
   * Converts Decimal fields to strings and strips out relation fields.
   */
  static fromPrisma(product: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: { toString(): string };
    compareAtPrice: { toString(): string } | null;
    sku: string | null;
    categoryId: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ProductEntity {
    const entity = new ProductEntity();
    entity.id = product.id;
    entity.name = product.name;
    entity.slug = product.slug;
    entity.description = product.description;
    entity.price = product.price.toString();
    entity.compareAtPrice = product.compareAtPrice ? product.compareAtPrice.toString() : null;
    entity.sku = product.sku;
    entity.categoryId = product.categoryId;
    entity.isActive = product.isActive;
    entity.createdAt = product.createdAt;
    entity.updatedAt = product.updatedAt;
    return entity;
  }
}
