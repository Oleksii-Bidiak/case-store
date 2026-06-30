import { ApiProperty } from '@nestjs/swagger';

/**
 * Aggregated rating summary for a product's approved reviews. Rendered as the
 * stars strip at the top of the PDP reviews tab.
 */
export class ReviewAggregateEntity {
  @ApiProperty({
    description: 'Average approved-review rating (1–5), or null when there are no reviews',
    type: Number,
    nullable: true,
    example: 4.3,
  })
  ratingAverage!: number | null;

  @ApiProperty({ description: 'Number of approved reviews', example: 12 })
  ratingCount!: number;

  /**
   * Build a ReviewAggregateEntity, rounding the average to one decimal place
   * for display (e.g. 4.333… → 4.3). A null average passes through unchanged.
   */
  static fromAggregate(data: {
    ratingAverage: number | null;
    ratingCount: number;
  }): ReviewAggregateEntity {
    const entity = new ReviewAggregateEntity();
    entity.ratingAverage =
      data.ratingAverage != null ? Math.round(data.ratingAverage * 10) / 10 : null;
    entity.ratingCount = data.ratingCount;
    return entity;
  }
}
