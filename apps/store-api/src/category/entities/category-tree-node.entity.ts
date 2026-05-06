/**
 * Domain entity representing a category node in a tree structure.
 *
 * Used for the public category tree endpoint (GET /api/categories/tree)
 * where categories are nested with their children for navigation menus.
 *
 * Unlike CategoryEntity, this includes a `children` array for
 * recursive nesting but excludes parentId and timestamps since
 * the hierarchy is expressed through nesting.
 */
export class CategoryTreeNodeEntity {
  id!: string;
  name!: string;
  slug!: string;
  description!: string | null;
  image!: string | null;
  isActive!: boolean;
  sortOrder!: number;
  children!: CategoryTreeNodeEntity[];

  /**
   * Create a CategoryTreeNodeEntity from a Prisma Category model
   * with recursively included children.
   *
   * Expects Prisma result with nested `children` relations
   * (e.g., using `include: { children: { include: { children: ... } } }`).
   */
  static fromPrisma(category: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    image: string | null;
    isActive: boolean;
    sortOrder: number;
    children: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      image: string | null;
      isActive: boolean;
      sortOrder: number;
      children: unknown[];
    }>;
  }): CategoryTreeNodeEntity {
    const entity = new CategoryTreeNodeEntity();
    entity.id = category.id;
    entity.name = category.name;
    entity.slug = category.slug;
    entity.description = category.description;
    entity.image = category.image;
    entity.isActive = category.isActive;
    entity.sortOrder = category.sortOrder;
    entity.children = (category.children ?? []).map((child) =>
      CategoryTreeNodeEntity.fromPrisma(
        child as Parameters<typeof CategoryTreeNodeEntity.fromPrisma>[0],
      ),
    );
    return entity;
  }
}
