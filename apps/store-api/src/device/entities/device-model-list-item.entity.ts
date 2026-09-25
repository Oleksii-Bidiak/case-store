import { PickType } from '@nestjs/swagger';
import { DeviceModelEntity } from './device-model.entity';

/**
 * The light, PUBLIC projection of a device model (TASK-702) — what the public
 * `GET /device-models` list serves to the homepage ModelPicker, the catalog
 * "Сумісний пристрій" filter and its chip, the legacy `?deviceModelId=` rewrite
 * and the admin product-compat multiselect. Every one of them needs exactly
 * `id` (select key), `deviceBrandId` (brand cascade), `name` (label) and `slug`
 * (the catalogue URL) — nothing else.
 *
 * The compat-landing SEO copy (`metaTitle`/`metaDescription`/`description`,
 * TASK-490) deliberately stays OFF this shape: the list carries up to 200 rows
 * and that copy is written for one page's `<head>`, so it lives only on the full
 * {@link DeviceModelEntity} served by the landing route and the admin routes.
 * Add a field here only when a list consumer actually renders it — narrowing a
 * public contract later is a breaking change, widening it is not.
 */
export class DeviceModelListItemEntity extends PickType(DeviceModelEntity, [
  'id',
  'deviceBrandId',
  'name',
  'slug',
] as const) {
  /**
   * Build the projection from any row that has at least these four columns.
   * Copies field by field (never spreads) so a wider row — a full Prisma model,
   * a test fixture — cannot leak an extra key into the response.
   */
  static fromPrisma(model: {
    id: string;
    deviceBrandId: string;
    name: string;
    slug: string;
  }): DeviceModelListItemEntity {
    const entity = new DeviceModelListItemEntity();
    entity.id = model.id;
    entity.deviceBrandId = model.deviceBrandId;
    entity.name = model.name;
    entity.slug = model.slug;
    return entity;
  }
}
