import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Body of `POST /api/products/:productId/images/attach` (TASK-441).
 *
 * Only the asset id: everything else about the new gallery row — the URL, the
 * LQIP, the alt text — is READ OFF THE ASSET rather than accepted from the
 * client. Letting the caller send a `url` would turn "attach the picture the
 * operator picked" into "write an arbitrary string into a product's gallery",
 * which is a different feature and a way to point a product page at any host
 * the storefront's image allow-list happens to permit.
 */
export class AttachImageDto {
  @ApiProperty({
    description: 'Id of the media-library asset to attach to this product',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  mediaAssetId!: string;
}
