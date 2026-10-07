import { ApiProperty } from '@nestjs/swagger';
import { CategoryEntity } from './category.entity';

/** A carousel a category delete would switch to the target (TASK-1776). */
export class CategoryDeletionCarouselEntity {
  @ApiProperty({ description: 'Carousel id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Carousel title as the admin shows it', example: 'Навушники тижня' })
  name!: string;
}

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
 * the number the delete actually moves. They are reported separately as
 * `deletedProductCount` (TASK-655), because they decide whether the category may be
 * deleted without a move target.
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

  @ApiProperty({
    description:
      'Every homepage carousel pointing into the subtree, by name (TASK-1776) — exactly the ' +
      'ones the delete switches to the target. carouselCount is its length',
    type: [CategoryDeletionCarouselEntity],
  })
  carousels!: CategoryDeletionCarouselEntity[];

  @ApiProperty({
    description:
      'Soft-deleted products filed anywhere in the subtree (TASK-655). Hidden from the ' +
      'catalogue, but they still move with a delete — and they block a delete WITHOUT a ' +
      'move target: only a category with all four counts at zero is truly empty',
    example: 0,
  })
  deletedProductCount!: number;
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
    impact: {
      subcategoryCount: number;
      productCount: number;
      carouselCount: number;
      carousels: Array<{ id: string; name: string }>;
      deletedProductCount: number;
    },
  ): AdminCategoryDetailEntity {
    const entity = Object.assign(new AdminCategoryDetailEntity(), category);
    const deletionImpact = new CategoryDeletionImpactEntity();
    deletionImpact.subcategoryCount = impact.subcategoryCount;
    deletionImpact.productCount = impact.productCount;
    deletionImpact.carouselCount = impact.carouselCount;
    deletionImpact.carousels = impact.carousels.map((carousel) =>
      Object.assign(new CategoryDeletionCarouselEntity(), { id: carousel.id, name: carousel.name }),
    );
    deletionImpact.deletedProductCount = impact.deletedProductCount;
    entity.deletionImpact = deletionImpact;
    return entity;
  }
}
