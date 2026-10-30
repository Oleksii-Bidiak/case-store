import { ApiProperty, PickType } from '@nestjs/swagger';
import { DeviceModelEntity } from './device-model.entity';

/**
 * The light, PUBLIC projection of a device model (TASK-702) — what the public
 * `GET /device-models` list serves to the homepage device picker, the device
 * dialog, the catalog "Сумісний пристрій" filter and its chip, the legacy
 * `?deviceModelId=` rewrite and the admin product-compat multiselect.
 *
 * TASK-1952 / TASK-2070 widened it with what the device picker renders on a
 * tile: `series` + `brandName`/`brandSlug` (the device family colour is derived
 * from them on the storefront), `releaseYear`, and `productCount` (how many
 * publicly visible products fit the model — the "popular" order and the tile
 * caption). All of it is public by nature.
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
  // Redeclared rather than picked: on the full entity they are optional in the
  // schema, here they are always present (null when unknown), so the generated
  // client type is `string | null`, not `string | null | undefined`.
  @ApiProperty({
    description: 'Series grouping (e.g. "iPhone 15"); null when not set',
    example: 'iPhone 15',
    type: String,
    nullable: true,
  })
  series!: string | null;

  @ApiProperty({
    description: 'Release year; null when not set',
    example: 2023,
    type: Number,
    nullable: true,
  })
  releaseYear!: number | null;

  @ApiProperty({ description: 'Owning device brand name', example: 'Apple' })
  brandName!: string;

  @ApiProperty({ description: 'Owning device brand slug', example: 'apple' })
  brandSlug!: string;

  @ApiProperty({
    description:
      'Number of publicly visible products (active, not deleted, in a visible category) ' +
      'compatible with this model',
    example: 42,
    minimum: 0,
  })
  productCount!: number;

  /**
   * Build the projection from any row that has at least these columns. Copies
   * field by field (never spreads) so a wider row — a full Prisma model, a test
   * fixture — cannot leak an extra key into the response.
   */
  static fromRow(row: {
    id: string;
    deviceBrandId: string;
    name: string;
    slug: string;
    series: string | null;
    releaseYear: number | null;
    brandName: string;
    brandSlug: string;
    productCount: number;
  }): DeviceModelListItemEntity {
    const entity = new DeviceModelListItemEntity();
    entity.id = row.id;
    entity.deviceBrandId = row.deviceBrandId;
    entity.name = row.name;
    entity.slug = row.slug;
    entity.series = row.series;
    entity.releaseYear = row.releaseYear;
    entity.brandName = row.brandName;
    entity.brandSlug = row.brandSlug;
    entity.productCount = row.productCount;
    return entity;
  }
}
