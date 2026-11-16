import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Body of `PUT /api/admin/seo-settings/logo` (TASK-2041).
 *
 * Only the asset id — the URL is read off the asset, never accepted from the
 * client. `logoUrl` stays out of `UpdateSeoSettingsDto` for the same reason: an
 * admin must not be able to point the logo at an arbitrary string.
 */
export class SetLogoFromLibraryDto {
  @ApiProperty({
    description: 'Id of the media-library asset to use as the store logo',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  // 'loose' like every other @IsUUID in src/ — see AttachImageDto.
  @IsUUID('loose', { message: 'mediaAssetId must be a valid UUID' })
  mediaAssetId!: string;
}
