import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

/**
 * DTO for updating an order's status.
 *
 * Used internally by the payment webhook handler (TASK-034) and the admin
 * order-management endpoints (TASK-041). Not exposed on a public Phase 3
 * endpoint — customers may only cancel a PENDING order.
 */
export class UpdateOrderStatusDto {
  @ApiProperty({ description: 'Target order status', enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  /**
   * Optimistic-lock token (TASK-332, edge case E-11).
   *
   * The `updatedAt` the client had in front of it when the operator chose the new
   * status. If the stored row has moved on since, the request is refused with
   * `409 ORDER_STALE` rather than quietly winning a race whose loser was another
   * human being — two admins on one order used to produce last-write-wins plus two
   * history rows describing changes only one of which survived.
   *
   * Declared as an ISO string rather than a `Date`: the global ValidationPipe runs
   * with `enableImplicitConversion: true`, and letting it coerce a date type is how
   * a malformed value silently becomes `Invalid Date` — which then compares unequal
   * to everything and surfaces as staleness instead of as a bad request. The
   * controller does the one explicit conversion.
   *
   * Optional so system callers (payment callback, reconcile worker) — which have no
   * stale screen to defend — are not forced to invent a version.
   */
  @ApiProperty({
    description:
      "The order's `updatedAt` as the client last read it. When supplied and no longer " +
      'current, the request is rejected with 409 ORDER_STALE (another admin changed the ' +
      'order first). Omit for system-driven changes.',
    required: false,
    format: 'date-time',
    example: '2026-07-28T10:15:30.000Z',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;

  /**
   * TASK-788: the operator's «Все одно відправити» from the admin's
   * unpaid-shipment dialog (TASK-468). The history note itself is decided by the
   * server from the order's payment state — see `OrderService.updateStatus` — so
   * omitting this never hides an unpaid shipment and setting it on a paid order
   * never invents one.
   */
  @ApiProperty({
    description:
      'The operator confirmed shipping an ONLINE order whose payment is not confirmed yet ' +
      '(the admin dialog «Оплату не підтверджено — відправляти?»). Such a move is recorded ' +
      'in the order history with note SHIPPED_UNPAID — decided from the payment state, ' +
      'with or without this flag.',
    required: false,
    example: true,
  })
  @IsOptional()
  // The RAW value: implicit conversion would turn any non-empty string into true.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key])
  @IsBoolean()
  confirmUnpaidShipment?: boolean;
}
