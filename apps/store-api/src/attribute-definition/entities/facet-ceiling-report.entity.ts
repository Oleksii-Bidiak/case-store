import { ApiProperty } from '@nestjs/swagger';

/**
 * One category of a subtree whose DECLARED facets exceed the storefront
 * ceiling (TASK-707). "Declared" = effective (own + inherited) definitions
 * that are `isFilterable` and of a facetable type — what the category could
 * offer if every facet had a value in the current slice.
 */
export class FacetCeilingCategoryEntity {
  @ApiProperty({ description: 'Category UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  categoryId!: string;

  @ApiProperty({ description: 'Category name', example: 'Зарядки' })
  categoryName!: string;

  @ApiProperty({
    description: 'How many facets the category declares (own + inherited)',
    example: 7,
  })
  facetCount!: number;

  @ApiProperty({
    description:
      'Labels of the facets past the ceiling in template order — the ones the storefront ' +
      'drops first when every facet has values (an ACTIVE facet is still always offered)',
    type: [String],
    example: ['Комплектація'],
  })
  overflowLabels!: string[];
}

/**
 * Admin signal for the facet ceiling (TASK-707): the public facet endpoint
 * returns at most `limit` facets per category, so a category declaring more
 * silently loses the tail of its sidebar. This report names every category of
 * a subtree that is over, so the operator sees it where facets are edited.
 */
export class FacetCeilingReportEntity {
  @ApiProperty({
    description: 'Most facets the storefront offers per category (MAX_SPEC_FACETS)',
    example: 6,
  })
  limit!: number;

  @ApiProperty({
    description: 'Categories of the subtree over the ceiling; empty when none is',
    type: [FacetCeilingCategoryEntity],
  })
  categories!: FacetCeilingCategoryEntity[];
}
