import { ApiProperty } from '@nestjs/swagger';
import { MEDIA_USAGE_KINDS, MediaUsage, MediaUsageKind } from '../media-usage.types';

/** One place a media asset is currently referenced from. */
export class MediaUsageEntity {
  @ApiProperty({
    description:
      'Which column holds the reference. One per COLUMN, not per table: an article can ' +
      'use the same asset as its cover, as its social card and inside its body, and an ' +
      'operator told only "used by this article" cannot tell which to change.',
    enum: Object.values(MEDIA_USAGE_KINDS),
    example: MEDIA_USAGE_KINDS.PRODUCT_IMAGE,
  })
  kind!: MediaUsageKind;

  @ApiProperty({
    description: 'Primary key of the referencing row (the singleton id for site settings)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  entityId!: string;

  @ApiProperty({
    description:
      'What the operator calls that row — a product name, an article title. The admin ' +
      'panel supplies its own Ukrainian wording for `kind` and uses this for the "which ' +
      'one", so no UI copy lives in the API.',
    example: 'Apple iPhone 16 Pro',
  })
  label!: string;

  static fromUsage(usage: MediaUsage): MediaUsageEntity {
    const entity = new MediaUsageEntity();
    entity.kind = usage.kind;
    entity.entityId = usage.entityId;
    entity.label = usage.label;
    return entity;
  }
}
