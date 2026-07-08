import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-decorated response classes for `GET /api/admin/dashboard/needs-action`
 * (TASK-248). Every field carries an explicit `@ApiProperty({ type })` so the
 * OpenAPI schema is fully resolved and Orval emits a typed model rather than an
 * inline `{ [key: string]: unknown }`. The envelope mirrors the already-shipped
 * `ContactUnreadResponse` (`{ data: { ... } }`) consumed by the sidebar badge.
 */
export class NeedsActionDto {
  @ApiProperty({
    type: Number,
    description: 'Orders awaiting confirmation (status = PENDING)',
    example: 4,
  })
  newOrders!: number;

  @ApiProperty({
    type: Number,
    description: 'Reviews awaiting moderation (isActive = false)',
    example: 2,
  })
  pendingReviews!: number;

  @ApiProperty({
    type: Number,
    description:
      'Active orders not yet paid — paymentStatus != PAID AND status NOT IN (CANCELLED, REFUNDED)',
    example: 7,
  })
  unpaidInTransit!: number;

  @ApiProperty({
    type: Number,
    description: 'Outbound emails permanently failed (MailOutbox status = FAILED)',
    example: 1,
  })
  failedMails!: number;

  @ApiProperty({
    type: Number,
    description: 'Orders sitting in PENDING for more than 48 hours (subset of newOrders)',
    example: 1,
  })
  pendingOver48h!: number;
}

export class NeedsActionResponse {
  @ApiProperty({ type: NeedsActionDto })
  data!: NeedsActionDto;
}
