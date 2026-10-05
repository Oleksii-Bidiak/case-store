import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-decorated response classes for `GET /api/admin/dashboard/needs-action`
 * (TASK-248). Every field carries an explicit `@ApiProperty({ type })` so the
 * OpenAPI schema is fully resolved and Orval emits a typed model rather than an
 * inline `{ [key: string]: unknown }`. The envelope mirrors the already-shipped
 * `ContactUnreadResponse` (`{ data: { ... } }`) consumed by the sidebar badge.
 */
/**
 * WHAT the rating-abuse counter counted (TASK-601). A bare number could only
 * link to the whole review list, where the star-only rows that make up most
 * abuse are not even shown; these name the series so the card can open it.
 */
export class RatingAbuseSignalsDto {
  @ApiProperty({
    type: [String],
    description: 'Products with more than 10 ratings in the last hour',
    example: ['3f2b8c1e-0d6a-4d7e-9b1a-2c4e6f8a0b1c'],
  })
  productIds!: string[];

  @ApiProperty({
    type: [String],
    description:
      'Addresses behind 3 or more 1★ ratings in the last 24 hours, not counting rows on the ' +
      'products listed above (one abuser on one product is one situation, not two)',
    example: ['203.0.113.42'],
  })
  createdIps!: string[];
}

export class NeedsActionDto {
  @ApiProperty({
    type: Number,
    description: 'Orders awaiting confirmation (status = PENDING)',
    example: 4,
  })
  newOrders!: number;

  @ApiProperty({
    type: Number,
    description: 'Review texts awaiting a moderation verdict (textStatus = PENDING)',
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
    description: 'Outbound emails permanently failed (NotificationOutbox status = FAILED)',
    example: 1,
  })
  failedMails!: number;

  @ApiProperty({
    type: Number,
    description: 'Orders sitting in PENDING for more than 48 hours (subset of newOrders)',
    example: 1,
  })
  pendingOver48h!: number;

  @ApiProperty({
    type: Number,
    description:
      'Things that look like rating abuse: products with more than 10 ratings in the last ' +
      'hour, plus IP addresses behind 3 or more 1★ ratings in the last 24 hours',
    example: 2,
  })
  ratingAbuse!: number;

  @ApiProperty({
    type: () => RatingAbuseSignalsDto,
    description:
      'The flagged rating-abuse situations by name (TASK-601) — what the card links to. ' +
      '`ratingAbuse` is the sum of the two list lengths',
  })
  ratingAbuseSignals!: RatingAbuseSignalsDto;

  @ApiProperty({
    type: Number,
    description:
      'Open orders holding at least one line that can no longer be supplied — the product is ' +
      'deleted, unpublished or oversold, or the reservation TTL released the order (TASK-470)',
    example: 3,
  })
  unavailableItems!: number;

  @ApiProperty({
    type: Number,
    description:
      'Orders paid AFTER they were cancelled — still CANCELLED, payment PAID, history note ' +
      'PAID_AFTER_CANCEL (a late LiqPay success after the reservation lapsed). The operator ' +
      'decides: revive the order or refund (TASK-352)',
    example: 0,
  })
  paidAfterCancel!: number;
}

export class NeedsActionResponse {
  @ApiProperty({ type: NeedsActionDto })
  data!: NeedsActionDto;
}
