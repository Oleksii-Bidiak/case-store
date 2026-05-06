/**
 * Domain entity representing a category with its product count.
 *
 * Used for admin listing endpoints where the number of products
 * per category is needed for display purposes.
 * Contains all CategoryEntity fields plus an additional productCount.
 */
export class CategoryWithCountEntity {
  id!: string;
  name!: string;
  slug!: string;
  description!: string | null;
  image!: string | null;
  parentId!: string | null;
  isActive!: boolean;
  sortOrder!: number;
  createdAt!: Date;
  updatedAt!: Date;
  productCount!: number;

  /**
   * Create a CategoryWithCountEntity from a Prisma Category model
   * with an aggregated product count.
   */
  static fromPrisma(
    category: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
      image: string | null;
      parentId: string | null;
      isActive: boolean;
      sortOrder: number;
      createdAt: Date;
      updatedAt: Date;
    },
    productCount: number,
  ): CategoryWithCountEntity {
    const entity = new CategoryWithCountEntity();
    entity.id = category.id;
    entity.name = category.name;
    entity.slug = category.slug;
    entity.description = category.description;
    entity.image = category.image;
    entity.parentId = category.parentId;
    entity.isActive = category.isActive;
    entity.sortOrder = category.sortOrder;
    entity.createdAt = category.createdAt;
    entity.updatedAt = category.updatedAt;
    entity.productCount = productCount;
    return entity;
  }
}
