import { ApiProperty } from '@nestjs/swagger';
import { ProductEntity } from './product.entity';
import { ProductActorEntity } from './product-actor.entity';
import type { ProductSource } from './product-source';

/**
 * One row of the admin product list (`GET /api/products/admin`, TASK-1830):
 * {@link ProductEntity} plus WHEN and BY WHOM the product was deleted, for the
 * «Видалені» view («видалено 01.10 · Олена К.», Т8).
 *
 * A list-only subclass on purpose: the single-product and mutation responses keep the
 * plain entity, which deliberately does not expose the tombstone (a deleted product is
 * never returned by them, and `deletedBy` is only resolved by the list read).
 */
export class AdminProductListItemEntity extends ProductEntity {
  @ApiProperty({
    description:
      'When the product was deleted (TASK-1830): set on the `deleted=true` list, null on ' +
      'every live row. This is what `sortBy=deletedAt` orders by — `updatedAt` can move ' +
      'after the delete (a cancelled order returning stock), so it is no substitute',
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-10-01T09:30:00.000Z',
  })
  deletedAt!: Date | null;

  @ApiProperty({
    description:
      'Who deleted it (TASK-1830): the actor of the latest `product.remove` entry in the ' +
      'action log. Resolved only on the `deleted=true` list; null on live rows and on a ' +
      'tombstone whose delete has no staff actor on record',
    type: () => ProductActorEntity,
    nullable: true,
  })
  deletedBy!: ProductActorEntity | null;

  static fromListRow(
    product: ProductSource & { reservedQty: number },
    deletedBy: ProductActorEntity | null,
  ): AdminProductListItemEntity {
    const entity = Object.assign(
      new AdminProductListItemEntity(),
      ProductEntity.fromPrisma(product),
    );
    entity.deletedAt = product.deletedAt ?? null;
    entity.deletedBy = deletedBy;
    return entity;
  }
}
