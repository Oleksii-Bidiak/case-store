import { ApiProperty } from '@nestjs/swagger';
import { CategoryTreeNodeEntity } from './category-tree-node.entity';

/**
 * Row shape the admin tree is assembled from — one flat `findMany` per plan 158
 * §3.3 (no nested `include`, therefore no 3-level structural cap).
 */
export interface AdminCategoryTreeRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  isActive: boolean;
  sortOrder: number;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: Date;
  _count: { products: number };
}

/**
 * Admin variant of {@link CategoryTreeNodeEntity} (TASK-291, plan 158 §3.3/§6).
 *
 * Strictly ADDITIVE over the public tree node — every existing field is kept, so the
 * existing consumers of `GET /api/categories/admin/tree` (the admin product form and
 * carousel form) keep compiling — plus the three fields the tree UI needs:
 *
 * - `parentId` — the DnD payload is built from parent buckets, so the hierarchy has to
 *   be readable from a node without walking the nesting.
 * - `productCount` — active products only; backs the "Товари" column.
 * - `depth` — 1-BASED level (a root is level 1), the same convention as
 *   `MAX_CATEGORY_TREE_LEVELS` in `category-reorder.rules.ts`; feeds `aria-level` and the
 *   row indent.
 *
 * Unlike the public entity, this one is assembled from a FLAT query, so a node deeper
 * than the public tree's structural cap (level 5+) is still VISIBLE to the admin who has
 * to drag it back.
 */
export class AdminCategoryTreeNodeEntity extends CategoryTreeNodeEntity {
  @ApiProperty({
    description: 'Parent category id (null for a root category)',
    type: String,
    nullable: true,
    example: null,
  })
  parentId!: string | null;

  @ApiProperty({ description: 'Number of ACTIVE products in this category', example: 12 })
  productCount!: number;

  @ApiProperty({ description: '1-based tree level (a root category is level 1)', example: 1 })
  depth!: number;

  @ApiProperty({ description: 'Child categories', type: [AdminCategoryTreeNodeEntity] })
  children!: AdminCategoryTreeNodeEntity[];

  static fromRow(row: AdminCategoryTreeRow, depth: number): AdminCategoryTreeNodeEntity {
    const entity = new AdminCategoryTreeNodeEntity();
    entity.id = row.id;
    entity.name = row.name;
    entity.slug = row.slug;
    entity.description = row.description;
    entity.image = row.image;
    entity.isActive = row.isActive;
    entity.sortOrder = row.sortOrder;
    entity.metaTitle = row.metaTitle;
    entity.metaDescription = row.metaDescription;
    entity.updatedAt = row.updatedAt;
    entity.parentId = row.parentId;
    entity.productCount = row._count.products;
    entity.depth = depth;
    entity.children = [];
    return entity;
  }
}
