import { ApiProperty } from '@nestjs/swagger';
import { toTwoDecimals } from '../money.util';

/**
 * The storefront's view of an offered add-on service (TASK-561) — what `/info`
 * lists under «Додаткові сервіси захисту», with the price a shopper would pay.
 *
 * Deliberately narrower than {@link AddonServiceEntity}: no `isActive` (the list
 * is active-only by construction) and no timestamps — a public read carries what
 * the page renders, nothing about how the catalogue is administered.
 *
 * `price` is the CATALOG price as a two-decimal string. A product-level
 * OVERRIDE delta can change it for one product, so the storefront labels it as a
 * starting price, never as the price for every device.
 */
export class PublicAddonServiceEntity {
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
  })
  description!: string | null;

  @ApiProperty({ description: 'Catalog price as a two-decimal string', example: '499.00' })
  price!: string;

  static fromPrisma(service: {
    id: string;
    name: string;
    description: string | null;
    price: { toString(): string };
  }): PublicAddonServiceEntity {
    const entity = new PublicAddonServiceEntity();
    entity.id = service.id;
    entity.name = service.name;
    entity.description = service.description;
    entity.price = toTwoDecimals(service.price);
    return entity;
  }
}
