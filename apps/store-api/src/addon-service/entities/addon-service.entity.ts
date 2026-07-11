import { ApiProperty } from '@nestjs/swagger';
import { toTwoDecimals } from '../money.util';

/**
 * Domain entity for an add-on service catalog row (TASK-174).
 *
 * `price` is a two-decimal string, never a float — same convention as
 * `CartItemEntity.price` / `OrderItemEntity.price`.
 */
export class AddonServiceEntity {
  @ApiProperty({
    description: 'Add-on service unique identifier',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({ description: 'Service name', example: 'Гарантійний сертифікат (24 міс.)' })
  name!: string;

  @ApiProperty({
    description: 'What the service covers',
    example: 'Продовжена гарантія на 24 місяці.',
    type: String,
    nullable: true,
    required: false,
  })
  description!: string | null;

  @ApiProperty({ description: 'Catalog price as string', example: '499.00' })
  price!: string;

  @ApiProperty({ description: 'Whether the service is currently offered', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-07-01T00:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-07-01T00:00:00.000Z' })
  updatedAt!: Date;

  static fromPrisma(service: {
    id: string;
    name: string;
    description: string | null;
    price: { toString(): string };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): AddonServiceEntity {
    const entity = new AddonServiceEntity();
    entity.id = service.id;
    entity.name = service.name;
    entity.description = service.description;
    entity.price = toTwoDecimals(service.price);
    entity.isActive = service.isActive;
    entity.createdAt = service.createdAt;
    entity.updatedAt = service.updatedAt;
    return entity;
  }
}
