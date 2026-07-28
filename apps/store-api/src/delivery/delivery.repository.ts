import { Injectable } from '@nestjs/common';
import { DeliverySetting } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Well-known fixed ID for the singleton delivery-settings row.
 *
 * There is EXACTLY ONE row in `delivery_settings`, always identified by this
 * constant. Distinct from `SiteContactRepository.SINGLETON_ID` (`...0001`) and
 * `SeoSettingsRepository.SINGLETON_ID` (`...0002`) so the three singletons never
 * collide in logs or seed output (plan 116 Decision 1).
 *
 * Note this is a plain `String @id` written by the repository, NOT the
 * `@default("singleton")` sketched in plan 068 — it follows the two existing
 * singletons rather than inventing a third convention.
 */
export const SINGLETON_ID = '00000000-0000-0000-0000-000000000003';

/**
 * Fields that may be written to the singleton delivery-settings row.
 * All are optional — only provided fields are updated.
 */
export interface UpsertDeliverySettingInput {
  senderCityRef?: string | null;
  senderCityName?: string | null;
  senderWarehouseRef?: string | null;
  defaultWeightKg?: number;
}

/**
 * DeliveryRepository — the ONLY place in the delivery module that touches
 * Prisma. `DeliveryService` depends on this, never on `PrismaClient`
 * (AGENTS.md, Clean Architecture).
 */
@Injectable()
export class DeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the singleton delivery-settings row.
   * Returns `null` when it has not been written yet — the caller falls back to
   * `NP_SENDER_CITY_REF` and then the built-in Kyiv default.
   */
  findSettings(): Promise<DeliverySetting | null> {
    return this.prisma.deliverySetting.findUnique({ where: { id: SINGLETON_ID } });
  }

  /**
   * Upsert the singleton delivery-settings row. Creates it (with the well-known
   * ID) on first write, updates it thereafter. Only provided fields are written.
   */
  upsertSettings(data: UpsertDeliverySettingInput): Promise<DeliverySetting> {
    return this.prisma.deliverySetting.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: { ...data },
    });
  }
}
