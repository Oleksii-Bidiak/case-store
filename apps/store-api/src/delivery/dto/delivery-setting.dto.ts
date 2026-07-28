import { ApiProperty } from '@nestjs/swagger';
import { DeliverySetting } from '@prisma/client';

/**
 * The admin-editable dispatch origin (TASK-080-E).
 *
 * **Internal configuration — never customer-facing.** It only parameterises the
 * Nova Poshta `getDocumentPrice` call (the shipping cost depends on how far the
 * parcel travels), and is exposed exclusively on the admin-guarded
 * `/api/admin/delivery-settings` routes. No public/storefront endpoint returns
 * it.
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
      updatedAt: null,
    };
  }
}

/** Response envelope for the admin delivery settings. */
export class DeliverySettingResponse {
  @ApiProperty({ type: DeliverySettingDto })
  data!: DeliverySettingDto;
}
