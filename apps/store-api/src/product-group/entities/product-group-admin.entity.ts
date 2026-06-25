import { ApiProperty } from '@nestjs/swagger';
import { ProductGroupAxisEntity, ProductSiblingEntity } from '../../product/entities';

/**
 * A product group as shown in the admin list: identity, axes, and how many
 * positions belong to it (TASK-142). Axes reuse {@link ProductGroupAxisEntity}.
 */
export class ProductGroupSummaryEntity {
  @ApiProperty({ description: 'Group id' })
  id!: string;

  @ApiProperty({ description: 'Group name', example: 'Tempered Glass for iPhone 15' })
  name!: string;

  @ApiProperty({ description: 'Whether the group is active', example: true })
  isActive!: boolean;

  @ApiProperty({ type: [ProductGroupAxisEntity] })
  axes!: ProductGroupAxisEntity[];

  @ApiProperty({ description: 'Number of positions in the group', example: 2 })
  positionCount!: number;

  static fromPrisma(group: {
    id: string;
    name: string;
    isActive: boolean;
    axes: Array<{ name: string; sortOrder: number }>;
    _count: { positions: number };
  }): ProductGroupSummaryEntity {
    const entity = new ProductGroupSummaryEntity();
    entity.id = group.id;
    entity.name = group.name;
    entity.isActive = group.isActive;
    entity.axes = group.axes.map((a) => ({ name: a.name, sortOrder: a.sortOrder }));
    entity.positionCount = group._count.positions;
    return entity;
  }
}

/**
 * A product group with its axes and full position list, for the admin
 * create/edit detail view (TASK-142). Positions reuse {@link ProductSiblingEntity}.
 */
export class ProductGroupDetailEntity {
  @ApiProperty({ description: 'Group id' })
  id!: string;

  @ApiProperty({ description: 'Group name', example: 'Tempered Glass for iPhone 15' })
  name!: string;

  @ApiProperty({ description: 'Whether the group is active', example: true })
  isActive!: boolean;

  @ApiProperty({ type: [ProductGroupAxisEntity] })
  axes!: ProductGroupAxisEntity[];

  @ApiProperty({ type: [ProductSiblingEntity] })
  positions!: ProductSiblingEntity[];

  static fromPrisma(group: {
    id: string;
    name: string;
    isActive: boolean;
    axes: Array<{ name: string; sortOrder: number }>;
    positions: Array<Parameters<typeof ProductSiblingEntity.fromPrisma>[0]>;
  }): ProductGroupDetailEntity {
    const entity = new ProductGroupDetailEntity();
    entity.id = group.id;
    entity.name = group.name;
    entity.isActive = group.isActive;
    entity.axes = group.axes.map((a) => ({ name: a.name, sortOrder: a.sortOrder }));
    entity.positions = group.positions.map((p) => ProductSiblingEntity.fromPrisma(p));
    return entity;
  }
}
