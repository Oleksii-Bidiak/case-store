import { ApiProperty } from '@nestjs/swagger';

/**
 * One attribute axis of a product group (e.g. "color", "pack"). The PDP renders
 * one selector per axis (TASK-142).
 */
export class ProductGroupAxisEntity {
  @ApiProperty({ description: 'Axis name', example: 'color' })
  name!: string;

  @ApiProperty({ description: 'Display order of the axis', example: 0 })
  sortOrder!: number;
}

/**
 * A sibling position within the same group — another buyable product the PDP
 * can navigate to when an attribute axis value changes.
 */
export class ProductSiblingEntity {
  @ApiProperty({ description: 'Position (product) id' })
  id!: string;

  @ApiProperty({ description: 'Position slug', example: 'tempered-glass-iphone-15-single-pack' })
  slug!: string;

  @ApiProperty({ description: 'Position name', example: 'Single Pack' })
  name!: string;

  @ApiProperty({ description: 'Price as string', example: '12.99' })
  price!: string;

  @ApiProperty({
    description: 'Attribute values keyed by axis name',
    example: { pack: 'single' },
    type: 'object',
    additionalProperties: true,
  })
  attributes!: Record<string, string>;

  @ApiProperty({ description: 'Available stock', example: 42 })
  stock!: number;

  @ApiProperty({ description: 'Whether the position is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Sort order within the group', example: 0 })
  positionOrder!: number;

  static fromPrisma(position: {
    id: string;
    slug: string;
    name: string;
    price: { toString(): string };
    attributes: unknown;
    stock: number;
    isActive: boolean;
    positionOrder: number;
  }): ProductSiblingEntity {
    const entity = new ProductSiblingEntity();
    entity.id = position.id;
    entity.slug = position.slug;
    entity.name = position.name;
    entity.price = position.price.toString();
    entity.attributes = (position.attributes as Record<string, string> | null) ?? {};
    entity.stock = position.stock;
    entity.isActive = position.isActive;
    entity.positionOrder = position.positionOrder;
    return entity;
  }
}

/**
 * The group a position belongs to, with its attribute axes and sibling
 * positions. Drives the PDP attribute selectors and cross-position navigation.
 */
export class ProductGroupEntity {
  @ApiProperty({ description: 'Group id' })
  id!: string;

  @ApiProperty({ description: 'Group name', example: 'Tempered Glass for iPhone 15' })
  name!: string;

  @ApiProperty({ type: [ProductGroupAxisEntity] })
  axes!: ProductGroupAxisEntity[];

  @ApiProperty({ type: [ProductSiblingEntity] })
  positions!: ProductSiblingEntity[];

  static fromPrisma(group: {
    id: string;
    name: string;
    axes: Array<{ name: string; sortOrder: number }>;
    positions: Array<Parameters<typeof ProductSiblingEntity.fromPrisma>[0]>;
  }): ProductGroupEntity {
    const entity = new ProductGroupEntity();
    entity.id = group.id;
    entity.name = group.name;
    entity.axes = group.axes.map((a) => ({ name: a.name, sortOrder: a.sortOrder }));
    entity.positions = group.positions.map((p) => ProductSiblingEntity.fromPrisma(p));
    return entity;
  }
}
