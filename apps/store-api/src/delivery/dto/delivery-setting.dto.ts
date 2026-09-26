import { ApiProperty } from '@nestjs/swagger';
import { DeliverySetting } from '@prisma/client';
import { toTwoDecimals } from '../../addon-service/money.util';

/**
 * The admin-editable dispatch origin (TASK-080-E).
 *
 * **Internal configuration — never customer-facing.** It only parameterises the
 * Nova Poshta `getDocumentPrice` call (the shipping cost depends on how far the
 * parcel travels), and is exposed exclusively on the admin-guarded
 * `/api/admin/delivery-settings` routes. No public/storefront endpoint returns
 * it.
 *
 * Since TASK-643 the same row also holds the delivery-method switches and the
 * courier's terms. Those DO reach the storefront, but only through the curated
 * `GET /api/delivery/methods` (`DeliveryMethodsDto`), never through this DTO.
 */
export class DeliverySettingDto {
  @ApiProperty({
    description: 'Nova Poshta city ref of the dispatch origin. Null → the env/Kyiv fallback.',
    example: 'db5c88e0-391c-11dd-90d9-001a92567626',
    type: String,
    nullable: true,
  })
  senderCityRef!: string | null;

  @ApiProperty({
    description: 'Human-readable dispatch city, so the admin form never shows a bare UUID',
    example: 'м. Київ, Київська обл.',
    type: String,
    nullable: true,
  })
  senderCityName!: string | null;

  @ApiProperty({
    description:
      'Optional specific dispatch branch. Stored for future waybill creation (InternetDocument/save); the cost estimate itself is city-to-city.',
    example: '1ec09d88-e1c2-11e3-8c4a-0050568002cf',
    type: String,
    nullable: true,
  })
  senderWarehouseRef!: string | null;

  @ApiProperty({
    description: 'Parcel weight (kg) used for the estimate when the real weight is unknown',
    example: 0.5,
  })
  defaultWeightKg!: number;

  // ─── Delivery methods (TASK-643) ───────────────────────────────────────────

  @ApiProperty({ description: 'Nova Poshta is offered at checkout', example: true })
  npEnabled!: boolean;

  @ApiProperty({ description: 'Pickup from a shop point is offered at checkout', example: false })
  pickupEnabled!: boolean;

  @ApiProperty({ description: 'Courier delivery is offered at checkout', example: false })
  courierEnabled!: boolean;

  @ApiProperty({
    description:
      'Free-text delivery ("the operator will quote shipping") is offered at checkout. ' +
      'Such orders can only be paid on delivery.',
    example: true,
  })
  otherEnabled!: boolean;

  @ApiProperty({
    description: 'The city the courier works in; shown to the customer, not enforced',
    example: 'Київ',
    type: String,
    nullable: true,
  })
  courierCityName!: string | null;

  @ApiProperty({ description: 'Flat courier price, UAH (decimal string)', example: '120.00' })
  courierPrice!: string;

  @ApiProperty({
    description:
      'Product subtotal (UAH, decimal string) from which the courier is free, inclusive. ' +
      'Null = never free.',
    example: '1500.00',
    type: String,
    nullable: true,
  })
  courierFreeFrom!: string | null;

  @ApiProperty({
    description: 'When the settings were last changed. Null when never written.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  updatedAt!: Date | null;

  /** Map the Prisma row onto the DTO (the `id` never leaves the backend). */
  static fromPrisma(row: DeliverySetting): DeliverySettingDto {
    return {
      senderCityRef: row.senderCityRef,
      senderCityName: row.senderCityName,
      senderWarehouseRef: row.senderWarehouseRef,
      defaultWeightKg: row.defaultWeightKg,
      npEnabled: row.npEnabled,
      pickupEnabled: row.pickupEnabled,
      courierEnabled: row.courierEnabled,
      otherEnabled: row.otherEnabled,
      courierCityName: row.courierCityName,
      // Money crosses the wire as a padded decimal string, never a float.
      courierPrice: toTwoDecimals(row.courierPrice),
      courierFreeFrom: row.courierFreeFrom === null ? null : toTwoDecimals(row.courierFreeFrom),
      updatedAt: row.updatedAt,
    };
  }

  /**
   * The shape returned when the singleton row has never been written: the admin
   * GET must render a usable form rather than 404. `defaultWeightKg` mirrors the
   * schema default so the form shows the value actually in force.
   */
  static empty(defaultWeightKg: number): DeliverySettingDto {
    return {
      senderCityRef: null,
      senderCityName: null,
      senderWarehouseRef: null,
      defaultWeightKg,
      // TASK-643: the schema defaults (TASK-642) — Nova Poshta and the free-text
      // path on, pickup and courier off until the owner configures them. Kept in
      // step with `schema.prisma` by the "defaults when unwritten" tests.
      npEnabled: true,
      pickupEnabled: false,
      courierEnabled: false,
      otherEnabled: true,
      courierCityName: null,
      courierPrice: '0.00',
      courierFreeFrom: null,
      updatedAt: null,
    };
  }
}

/** Response envelope for the admin delivery settings. */
export class DeliverySettingResponse {
  @ApiProperty({ type: DeliverySettingDto })
  data!: DeliverySettingDto;
}
