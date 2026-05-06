/**
 * Domain entity representing a product category (summary).
 *
 * This is a clean domain entity — not a Prisma model.
 * Used in product detail responses where only a category
 * summary (id, name, slug) is needed.
 */
export class ProductCategoryEntity {
  id!: string;
  name!: string;
  slug!: string;

  /**
   * Create a ProductCategoryEntity from a Prisma category relation.
   */
  static fromPrisma(category: { id: string; name: string; slug: string }): ProductCategoryEntity {
    const entity = new ProductCategoryEntity();
    entity.id = category.id;
    entity.name = category.name;
    entity.slug = category.slug;
    return entity;
  }
}
