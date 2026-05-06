/**
 * Domain entity representing a category.
 *
 * This is a clean domain entity — not a Prisma model.
 * It is returned by CategoryService methods and contains only
 * the data that should be exposed to the client.
 *
 * Relation fields (parent, children, products) are EXCLUDED
 * from the base entity. Use CategoryTreeNodeEntity for tree
 * responses and CategoryWithCountEntity for admin listings.
 */
export class CategoryEntity {
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

  /**
   * Create a CategoryEntity from a Prisma Category model.
   * Strips out relation fields (parent, children, products).
   */
  static fromPrisma(category: {
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
  }): CategoryEntity {
    const entity = new CategoryEntity();
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
    return entity;
  }
}
