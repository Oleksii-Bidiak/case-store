import { ApiProperty } from '@nestjs/swagger';
import { CategoryEntity } from './category.entity';

/**
 * What deleting a category would touch (TASK-652) — the numbers the admin delete
 * dialog shows BEFORE the operator confirms, so nothing moves silently.
 *
 * Deliberately NOT the public counts of `findWithProductCount`: those apply the
 * storefront visibility rule and would under-report the products that are about to
 * move. Deletion moves EVERY non-deleted product of the subtree, inactive ones too.
 *
 * Soft-deleted products of the subtree move as well (so a product restored later does
 * not point at a tombstone) but are NOT counted here on purpose: the dialog talks about
 * the catalogue the operator can see, and `productCount` can therefore be lower than
 * the number the delete actually moves.
 */
export class CategoryDeletionImpactEntity {
  @ApiProperty({
    description: 'Live categories below this one (the whole subtree minus the category itself)',
    example: 3,
  })
  subcategoryCount!: number;

  @ApiProperty({
    description:
      'Non-deleted products filed anywhere in the subtree, INCLUDING inactive ones — ' +
      'every one of them moves to the chosen target',
    example: 42,
  })
  productCount!: number;

  @ApiProperty({
    description: 'Homepage carousels pointing into the subtree — they switch to the target',
    example: 1,
  })
  carouselCount!: number;
}

/**
 * Admin single-category read (`GET /api/admin/categories/:id`, TASK-652):
 * {@link CategoryEntity} plus the {@link CategoryDeletionImpactEntity} preview. The
 * extra field is additive, so existing admin consumers of the plain entity keep
 * working unchanged.
 */
export class AdminCategoryDetailEntity extends CategoryEntity {
  @ApiProperty({
    description: 'What deleting this category would touch — for the delete dialog preview',
    type: () => CategoryDeletionImpactEntity,
  })
  deletionImpact!: CategoryDeletionImpactEntity;

  static fromCategory(
    category: CategoryEntity,
    impact: { subcategoryCount: number; productCount: number; carouselCount: number },
  ): AdminCategoryDetailEntity {
    const entity = Object.assign(new AdminCategoryDetailEntity(), category);
    const deletionImpact = new CategoryDeletionImpactEntity();
    deletionImpact.subcategoryCount = impact.subcategoryCount;
    deletionImpact.productCount = impact.productCount;
    deletionImpact.carouselCount = impact.carouselCount;
    entity.deletionImpact = deletionImpact;
    return entity;
  }
}
