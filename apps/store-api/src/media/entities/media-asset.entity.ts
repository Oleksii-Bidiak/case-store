import { ApiProperty } from '@nestjs/swagger';
import { MediaAsset } from '@prisma/client';
import { MediaUsage } from '../media-usage.types';
import { MediaUsageEntity } from './media-usage.entity';

/**
 * One image in the media library, as the admin panel sees it in a LIST.
 *
 * `usedInCount` and not `usedIn` here on purpose: the grid only needs to know
 * whether an asset is safe to delete, and the full list of places is what the
 * card (`GET /admin/media/:id`) is for. Both numbers come out of the SAME
 * {@link MediaUsageRepository} call, so the badge on the grid can never say
 * "unused" about something the delete then refuses.
 */
export class MediaAssetEntity {
  @ApiProperty({ description: 'Asset id', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({
    description: 'Absolute public URL of the stored file',
    example: 'http://localhost:3001/uploads/media/8f1c….webp',
  })
  url!: string;

  @ApiProperty({
    description: 'base64 LQIP for `next/image` blur-up; null for an animated-GIF passthrough',
    // `type: String` is MANDATORY on a nullable union — see the long note on
    // `UploadedImageEntity.blurDataUrl`. Without it the published schema is
    // `{"type":"object"}` and Orval hands callers an opaque map where the server
    // has always sent a base64 data-URL string.
    type: String,
    nullable: true,
    example: 'data:image/webp;base64,UklGR…',
  })
  blurDataUrl!: string | null;

  @ApiProperty({
    description:
      'Pixel width of the STORED render. 0 means unknown — every asset the TASK-441 ' +
      'backfill created from an existing product photo carries 0, because those numbers ' +
      'live inside the files and a migration cannot read them.',
    example: 2000,
  })
  width!: number;

  @ApiProperty({ description: 'Pixel height of the stored render; 0 = unknown', example: 1333 })
  height!: number;

  @ApiProperty({ description: 'Size of the stored file in bytes; 0 = unknown', example: 184320 })
  bytes!: number;

  @ApiProperty({ description: 'Media type of the stored file', example: 'image/webp' })
  mime!: string;

  @ApiProperty({
    description: 'Alternative text, shared by every consumer of this asset',
    type: String,
    nullable: true,
    example: 'Смартфон Apple iPhone 16 Pro — вигляд спереду',
  })
  alt!: string | null;

  @ApiProperty({
    description: 'Free-form operator tags used for filtering the library',
    type: [String],
    example: ['iphone', 'банер'],
  })
  tags!: string[];

  @ApiProperty({
    description: 'Who uploaded it; null for assets created by the TASK-441 backfill',
    type: String,
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  uploadedById!: string | null;

  @ApiProperty({
    description:
      'How many places currently reference this asset. COMPUTED on every read, never ' +
      'stored — see MediaUsageRepository. 0 is the only state in which a delete succeeds.',
    example: 0,
  })
  usedInCount!: number;

  @ApiProperty({ description: 'Creation timestamp', example: '2026-09-14T10:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last update timestamp', example: '2026-09-14T10:00:00.000Z' })
  updatedAt!: Date;

  static fromPrisma(asset: MediaAsset, usedInCount: number): MediaAssetEntity {
    const entity = new MediaAssetEntity();
    entity.id = asset.id;
    entity.url = asset.url;
    entity.blurDataUrl = asset.blurDataUrl;
    entity.width = asset.width;
    entity.height = asset.height;
    entity.bytes = asset.bytes;
    entity.mime = asset.mime;
    entity.alt = asset.alt;
    entity.tags = asset.tags;
    entity.uploadedById = asset.uploadedById;
    entity.usedInCount = usedInCount;
    entity.createdAt = asset.createdAt;
    entity.updatedAt = asset.updatedAt;
    return entity;
  }
}

/**
 * One asset with the full list of places that reference it — what the media
 * card and the delete refusal need.
 */
export class MediaAssetDetailEntity extends MediaAssetEntity {
  @ApiProperty({
    description:
      'Every current reference to this asset, in a stable order. Empty means the asset ' +
      'can be deleted.',
    type: [MediaUsageEntity],
  })
  usedIn!: MediaUsageEntity[];

  static fromPrismaWithUsage(asset: MediaAsset, usage: MediaUsage[]): MediaAssetDetailEntity {
    const entity = new MediaAssetDetailEntity();
    Object.assign(entity, MediaAssetEntity.fromPrisma(asset, usage.length));
    entity.usedIn = usage.map((one) => MediaUsageEntity.fromUsage(one));
    return entity;
  }
}
