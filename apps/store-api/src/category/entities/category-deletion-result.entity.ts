import { ApiProperty } from '@nestjs/swagger';

/**
 * What a category delete actually did (`DELETE /api/admin/categories/:id`, TASK-1775) —
 * counted inside the transaction that did the work, so the admin toast reports the real
 * numbers instead of the dialog's preview, and the dialog learns the id of a target it
 * asked the server to CREATE (no more re-reading the tree to find it by slug).
 */
export class CategoryDeletionResultEntity {
  @ApiProperty({
    description:
      'The category the products and carousels moved into — the existing `moveToId`, or ' +
      'the id of the category `moveToNew` created. Null for a target-less delete of a ' +
      'truly empty category',
    type: String,
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  targetId!: string | null;

  @ApiProperty({
    description:
      'Products re-filed into the target — active, inactive AND soft-deleted ones, so it ' +
      'can be higher than `deletionImpact.productCount` in the preview',
    example: 42,
  })
  movedProducts!: number;

  @ApiProperty({
    description:
      'Of `movedProducts`, the ones that are NOT soft-deleted (active or hidden) — the ' +
      'products the admin product list shows. `movedProducts - movedLiveProducts` is the ' +
      'number of soft-deleted ones that moved along. Counted in the same transaction',
    example: 40,
  })
  movedLiveProducts!: number;

  @ApiProperty({
    description: 'Homepage carousels switched from the deleted subtree to the target',
    example: 1,
  })
  switchedCarousels!: number;

  static fromResult(result: {
    targetId: string | null;
    movedProducts: number;
    movedLiveProducts: number;
    switchedCarousels: number;
  }): CategoryDeletionResultEntity {
    const entity = new CategoryDeletionResultEntity();
    entity.targetId = result.targetId;
    entity.movedProducts = result.movedProducts;
    entity.movedLiveProducts = result.movedLiveProducts;
    entity.switchedCarousels = result.switchedCarousels;
    return entity;
  }
}
