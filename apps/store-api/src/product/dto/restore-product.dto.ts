import { ApiProperty, PickType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

/**
 * Body of `POST /api/products/:id/restore` (TASK-656). Both fields are optional and
 * the body may be empty: by default the product comes back on the slug and SKU it had
 * before it was deleted.
 *
 * `slug`/`sku` are picked from {@link CreateProductDto}, so a restore accepts exactly
 * what a create accepts — the same slug pattern and length caps, one definition. Only
 * the Swagger descriptions are restated, because the create wording ("auto-generated
 * from name") is wrong for a restore.
 */
export class RestoreProductDto extends PickType(CreateProductDto, ['slug', 'sku'] as const) {
  @ApiProperty({
    description:
      'A new slug — send it only after a 409 PRODUCT_SLUG_CONFLICT / PRODUCT_SLUG_SKU_CONFLICT; ' +
      'omitted = the slug the product had before it was deleted',
    example: 'iphone-15-pro-case-clear-magsafe-2',
    required: false,
  })
  slug?: string;

  @ApiProperty({
    description:
      'A new SKU — send it only after a 409 PRODUCT_SKU_CONFLICT / PRODUCT_SLUG_SKU_CONFLICT; ' +
      'omitted = the SKU the product had before it was deleted',
    example: 'IP15-PRO-CASE-CLR-2',
    required: false,
  })
  sku?: string;
}
