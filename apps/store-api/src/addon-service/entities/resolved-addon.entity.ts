import { ApiProperty } from '@nestjs/swagger';
import { AddonDeltaType } from '@prisma/client';
import { toTwoDecimals } from '../money.util';
import type {
  AddonSource,
  CategoryTemplateSource,
  ProductDeltaRow,
  ResolvedAddon,
  ResolvedCategoryTemplate,
} from '../addon-service.types';

/**
 * One add-on service that applies to a product, after template inheritance and
 * per-product delta application (TASK-174). The Swagger-facing mirror of
 * {@link ResolvedAddon} — this is what the storefront cart and the admin
 * product panel both render.
 */
export class ResolvedAddonEntity {
  @ApiProperty({
    description: 'Catalog id of the add-on service',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  addonServiceId!: string;

  @ApiProperty({ description: 'Service name', example: 'Страхування від пошкоджень' })
  name!: string;

  @ApiProperty({
    description: 'What the service covers',
    type: String,
    nullable: true,
    required: false,
  })
  description!: string | null;

  @ApiProperty({
    description:
      'EFFECTIVE price as a string — the catalog price, or the ADD/OVERRIDE delta price when the product has one',
    example: '1299.00',
  })
  price!: string;

  @ApiProperty({
    description:
      "Where this entry's effective value came from: `template` (inherited from the category template), `add` (exclusive to this product), `override` (this product's own price for an inherited service). Drives the admin badges; inert for the storefront.",
    enum: ['template', 'add', 'override'],
    example: 'template',
  })
  source!: AddonSource;

  static fromResolved(addon: ResolvedAddon): ResolvedAddonEntity {
    const entity = new ResolvedAddonEntity();
    entity.addonServiceId = addon.addonServiceId;
    entity.name = addon.name;
    entity.description = addon.description;
    entity.price = addon.price;
    entity.source = addon.source;
    return entity;
  }
}

/**
 * A per-product delta row as read back by the admin product panel (TASK-174).
 */
export class AddonServiceDeltaEntity {
  @ApiProperty({ description: 'Delta row id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'Product this delta belongs to' })
  productId!: string;

  @ApiProperty({ description: 'Add-on service this delta targets' })
  addonServiceId!: string;

  @ApiProperty({
    description: 'Delta kind',
    enum: AddonDeltaType,
    example: AddonDeltaType.OVERRIDE,
  })
  type!: AddonDeltaType;

  @ApiProperty({
    description: 'Delta price (null = use the catalog price; always null for REMOVE)',
    type: String,
    nullable: true,
    example: '1299.00',
  })
  price!: string | null;

  @ApiProperty({ description: 'Name of the targeted add-on service' })
  addonServiceName!: string;

  static fromRow(row: ProductDeltaRow & { id: string }): AddonServiceDeltaEntity {
    const entity = new AddonServiceDeltaEntity();
    entity.id = row.id;
    entity.productId = row.productId;
    entity.addonServiceId = row.addonServiceId;
    entity.type = row.type;
    entity.price = row.price === null ? null : toTwoDecimals(row.price);
    entity.addonServiceName = row.addonService.name;
    return entity;
  }
}

/**
 * Admin read view of a category's template resolution (TASK-174) — powers the
 * category form's "ця категорія не має власного шаблону; успадковує «X»" note.
 */
export class ResolvedCategoryTemplateEntity {
  @ApiProperty({
    description:
      '`own` = this category declares its own template; `inherited` = the nearest ancestor that declares one does; `none` = nobody in the chain does',
    enum: ['own', 'inherited', 'none'],
    example: 'inherited',
  })
  source!: CategoryTemplateSource;

  @ApiProperty({
    description: 'The category the resolved template actually comes from',
    type: String,
    nullable: true,
  })
  sourceCategoryId!: string | null;

  @ApiProperty({
    description: 'Name of that category — rendered directly in the admin hint',
    type: String,
    nullable: true,
    example: 'Смартфони',
  })
  sourceCategoryName!: string | null;

  @ApiProperty({ type: [ResolvedAddonEntity], description: 'The resolved template' })
  addons!: ResolvedAddonEntity[];

  static fromResolved(
    resolved: ResolvedCategoryTemplate,
    sourceCategoryName: string | null,
  ): ResolvedCategoryTemplateEntity {
    const entity = new ResolvedCategoryTemplateEntity();
    entity.source = resolved.source;
    entity.sourceCategoryId = resolved.sourceCategoryId;
    entity.sourceCategoryName = sourceCategoryName;
    entity.addons = resolved.addons.map((addon) => ResolvedAddonEntity.fromResolved(addon));
    return entity;
  }
}
