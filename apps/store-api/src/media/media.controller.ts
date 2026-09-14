import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
// Direct file import, NOT the `../auth` barrel: the barrel pulls the auth module
// in and the resulting require cycle leaves `CurrentUser` undefined at
// decorator-evaluation time.
import { CurrentUser } from '../auth/decorators';
import { imageMulterOptions } from '../uploads';
import { MediaService } from './media.service';
import { MediaListQueryDto, MediaMetadataDto } from './dto';
import { MediaAssetDetailEntity, MediaAssetEntity, MediaUsageEntity } from './entities';

/** One file per request — the admin panel uploads a batch as N requests. */
const SINGLE_FILE = imageMulterOptions(1);

/** Multipart body for the upload route, for Swagger/Orval. */
const UPLOAD_BODY = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: {
      file: { type: 'string', format: 'binary' },
      alt: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
};

/** Pagination metadata for the media list. */
class MediaPaginationMetaEntity {
  @ApiProperty({ description: 'Total assets matching the filters', example: 125 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 24 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 6 })
  totalPages!: number;
}

/** Response envelope for the media list. */
class MediaListResponseEnvelope {
  @ApiProperty({ type: [MediaAssetEntity] })
  data!: MediaAssetEntity[];

  @ApiProperty({ type: MediaPaginationMetaEntity })
  meta!: MediaPaginationMetaEntity;
}

/** Response envelope for a single asset, with its full usage list. */
class MediaAssetResponseEnvelope {
  @ApiProperty({ type: MediaAssetDetailEntity })
  data!: MediaAssetDetailEntity;
}

/**
 * The internal media library (TASK-441, plan 177).
 *
 *   POST   /api/admin/media      — upload a file into the library  (media:write)
 *   GET    /api/admin/media      — search + paginate the library   (media:read)
 *   GET    /api/admin/media/:id  — one asset with its usage list   (media:read)
 *   PATCH  /api/admin/media/:id  — edit alt text and tags          (media:write)
 *   DELETE /api/admin/media/:id  — delete, if nothing uses it      (media:write)
 *
 * WHY TWO PERMISSIONS AND NOT ONE. The four content-upload routes next door
 * (`uploads.controller.ts`) mirror the permission of the FIELD the URL lands in,
 * because each of them writes into exactly one kind of form. The library has no
 * such field: an asset here belongs to no entity yet, and the picker that lists
 * it will appear inside every content form there is. So the read has to be its
 * own key — otherwise the picker would need `products:write` to show a picture
 * to someone editing a banner. `media:write` then gates the destructive half
 * (upload, retag, delete) that a picker does not need.
 *
 * Both keys are new, and a new key is denied to everyone by default. That would
 * have shipped an empty picker to every existing content manager, so they arrive
 * with a data migration attached — see MEDIA_BACKFILL_SOURCE_PERMISSIONS in
 * `permission.catalog.ts` for why that is defensible here and not in general.
 */
@ApiTags('Media')
@ApiExtraModels(
  MediaAssetEntity,
  MediaAssetDetailEntity,
  MediaUsageEntity,
  MediaListResponseEnvelope,
  MediaAssetResponseEnvelope,
  MediaPaginationMetaEntity,
)
@Controller('admin/media')
@UseGuards(PermissionGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @RequirePermission('media:write')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload an image into the media library (admin)',
    operationId: 'mediaControllerUpload',
  })
  @ApiBody(UPLOAD_BODY)
  @ApiResponse({ status: 201, description: 'Asset stored', type: MediaAssetResponseEnvelope })
  @ApiResponse({ status: 400, description: 'No file, or a disallowed MIME type' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — media:write required' })
  @ApiResponse({ status: 413, description: 'File exceeds the 20 MB limit' })
  @ApiResponse({ status: 415, description: 'File contents are not a valid image' })
  async upload(
    @Body() metadata: MediaMetadataDto,
    @CurrentUser('id') uploadedById: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<MediaAssetResponseEnvelope> {
    const asset = await this.media.upload(file, metadata, uploadedById);

    return { data: asset };
  }

  @Get()
  @RequirePermission('media:read')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List media assets with search and pagination (admin)',
    operationId: 'mediaControllerFindAll',
  })
  @ApiResponse({
    status: 200,
    description: 'One page of the library',
    type: MediaListResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — media:read required' })
  findAll(@Query() query: MediaListQueryDto): Promise<MediaListResponseEnvelope> {
    return this.media.findAll(query);
  }

  @Get(':id')
  @RequirePermission('media:read')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get one media asset and every place that uses it (admin)',
    operationId: 'mediaControllerFindById',
  })
  @ApiParam({ name: 'id', description: 'Media asset UUID' })
  @ApiResponse({ status: 200, description: 'Asset found', type: MediaAssetResponseEnvelope })
  @ApiResponse({ status: 403, description: 'Forbidden — media:read required' })
  @ApiResponse({ status: 404, description: 'Media asset not found' })
  async findById(@Param('id') id: string): Promise<MediaAssetResponseEnvelope> {
    const asset = await this.media.findById(id);

    return { data: asset };
  }

  @Patch(':id')
  @RequirePermission('media:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Edit a media asset’s alt text and tags (admin)',
    operationId: 'mediaControllerUpdate',
  })
  @ApiParam({ name: 'id', description: 'Media asset UUID' })
  @ApiResponse({ status: 200, description: 'Asset updated', type: MediaAssetResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — media:write required' })
  @ApiResponse({ status: 404, description: 'Media asset not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: MediaMetadataDto,
  ): Promise<MediaAssetResponseEnvelope> {
    const asset = await this.media.update(id, dto);

    return { data: asset };
  }

  @Delete(':id')
  @RequirePermission('media:write')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete a media asset — only when nothing uses it (admin)',
    operationId: 'mediaControllerDelete',
  })
  @ApiParam({ name: 'id', description: 'Media asset UUID' })
  @ApiResponse({ status: 204, description: 'Asset and its file deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden — media:write required' })
  @ApiResponse({ status: 404, description: 'Media asset not found' })
  @ApiResponse({
    status: 409,
    description:
      'Still in use. The message names every place that references it; the full ' +
      'structured list is on GET /api/admin/media/:id.',
  })
  async delete(@Param('id') id: string): Promise<void> {
    await this.media.delete(id);
  }
}
