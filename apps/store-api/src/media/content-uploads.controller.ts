import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
// The `auth/decorators` sub-barrel, NOT the `../auth` barrel — see media.controller.ts.
import { CurrentUser } from '../auth/decorators';
import { imageMulterOptions, UploadedImageEntity, UploadedImageResponseEnvelope } from '../uploads';
import { MediaService } from './media.service';

/** One image per request — these are single-image fields on a form. */
const SINGLE_FILE = imageMulterOptions(1);

/**
 * Multipart body shape shared by all four routes, for Swagger/Orval.
 */
const SINGLE_FILE_BODY = {
  schema: {
    type: 'object',
    required: ['file'],
    properties: { file: { type: 'string', format: 'binary' } },
  },
};

/**
 * Content-image uploads (TASK-424).
 *
 *   POST /api/admin/uploads/categories — a category cover   (categories:write)
 *   POST /api/admin/uploads/brands     — a brand logo       (brands:write)
 *   POST /api/admin/uploads/banners    — banner artwork     (banners:write)
 *   POST /api/admin/uploads/blog       — a post cover photo (blog:write)
 *
 * WHY FOUR ROUTES AND NOT ONE `:subdir`. All four write to the same storage
 * subdir and run the identical pipeline, so one parameterised route
 * was the obvious shape — until the permission. `@RequirePermission` takes
 * exactly one key and `PermissionGuard` reads exactly one, by design: the guard
 * resolves a single requirement per handler, and a route cannot say "any of
 * these four". The alternatives were each worse than four handlers:
 *
 *   - one route with one of the four keys — wrong for the other three, so the
 *     banner editor would need `blog:write` to upload a banner;
 *   - one route with a NEW umbrella key — a permission that grants nothing on its
 *     own and defaults to denied, so every existing content manager silently
 *     loses the ability to upload until the owner finds and ticks it;
 *   - one route with a bespoke dynamic check — a second authorisation path
 *     alongside the guard, which is exactly what `permission.catalog.spec.ts`
 *     exists to prevent.
 *
 * The upload permission therefore mirrors the permission for the field the URL is
 * going into, which is the honest rule: whoever may edit a brand may upload a
 * brand logo, and nobody else. The router — not a runtime string check — is what
 * enumerates the targets, so no request-derived segment ever reaches a path (the
 * subdir is a module constant, and `ImageUploadService` still narrows it through
 * the `isStorageSubdir` whitelist).
 *
 * EVERY UPLOAD HERE IS A LIBRARY ASSET (TASK-2042). Until then these routes wrote
 * to `content/` and recorded nothing, so an editor holding `banners:write` but not
 * `media:write` — exactly the editor the admin's library-first upload falls back
 * for — put files on the disk that the library never listed and nobody could
 * find, reuse or clean up. They now go through {@link MediaService.upload}: the
 * same `media/` subdir, the same `MediaAsset` row (uploader, original name and
 * type), the same pipeline. That is also why this controller is registered in
 * `MediaModule` rather than `UploadsModule`: `MediaModule` imports
 * `UploadsModule`, so the other direction would be a cycle.
 *
 * Granting `media:write` alongside the content keys was the rejected alternative:
 * it changes what people may do (retag and delete any asset) to fix where a file
 * is recorded, and it is a data migration of RBAC grants — see the umbrella-key
 * note above and MEDIA_BACKFILL_SOURCE_PERMISSIONS in `permission.catalog.ts`. So
 * the field key still decides the upload, and `media:write` alone still gates
 * `POST`/`PATCH`/`DELETE /admin/media`: this editor's asset appears in the
 * library, and only a library editor may change or delete it.
 */
@ApiTags('Uploads')
@ApiExtraModels(UploadedImageEntity, UploadedImageResponseEnvelope)
@Controller('admin/uploads')
@UseGuards(PermissionGuard)
// Class-level rather than four copies: every route here is the same kind of
// request (TASK-586). The global 100/min is sized for JSON, while an upload
// holds a multipart buffer and then a decoded frame — the heaviest requests in
// the API were also the least limited ones. 20/min matches the admin routes and
// is far above any real rate of picking cover images by hand.
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class UploadsController {
  constructor(private readonly media: MediaService) {}

  /** POST /api/admin/uploads/categories — cover image for a category. */
  @Post('categories')
  @RequirePermission('categories:write')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a category image (admin)',
    operationId: 'uploadsControllerUploadCategoryImage',
  })
  @ApiBody(SINGLE_FILE_BODY)
  @ApiResponse({ status: 201, description: 'Image stored', type: UploadedImageResponseEnvelope })
  @ApiResponse({ status: 400, description: 'No file, or a disallowed MIME type' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — categories:write required' })
  @ApiResponse({ status: 413, description: 'File exceeds the 20 MB limit' })
  @ApiResponse({ status: 415, description: 'File contents are not a valid image' })
  uploadCategoryImage(
    @CurrentUser('id') uploadedById: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file, uploadedById);
  }

  /** POST /api/admin/uploads/brands — logo for a brand. */
  @Post('brands')
  @RequirePermission('brands:write')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a brand logo (admin)',
    operationId: 'uploadsControllerUploadBrandLogo',
  })
  @ApiBody(SINGLE_FILE_BODY)
  @ApiResponse({ status: 201, description: 'Image stored', type: UploadedImageResponseEnvelope })
  @ApiResponse({ status: 400, description: 'No file, or a disallowed MIME type' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — brands:write required' })
  @ApiResponse({ status: 413, description: 'File exceeds the 20 MB limit' })
  @ApiResponse({ status: 415, description: 'File contents are not a valid image' })
  uploadBrandLogo(
    @CurrentUser('id') uploadedById: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file, uploadedById);
  }

  /** POST /api/admin/uploads/banners — artwork for a banner. */
  @Post('banners')
  @RequirePermission('banners:write')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a banner image (admin)',
    operationId: 'uploadsControllerUploadBannerImage',
  })
  @ApiBody(SINGLE_FILE_BODY)
  @ApiResponse({ status: 201, description: 'Image stored', type: UploadedImageResponseEnvelope })
  @ApiResponse({ status: 400, description: 'No file, or a disallowed MIME type' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — banners:write required' })
  @ApiResponse({ status: 413, description: 'File exceeds the 20 MB limit' })
  @ApiResponse({ status: 415, description: 'File contents are not a valid image' })
  uploadBannerImage(
    @CurrentUser('id') uploadedById: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file, uploadedById);
  }

  /** POST /api/admin/uploads/blog — cover photo for a blog post. */
  @Post('blog')
  @RequirePermission('blog:write')
  @UseInterceptors(FileInterceptor('file', SINGLE_FILE))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a blog cover image (admin)',
    operationId: 'uploadsControllerUploadBlogCover',
  })
  @ApiBody(SINGLE_FILE_BODY)
  @ApiResponse({ status: 201, description: 'Image stored', type: UploadedImageResponseEnvelope })
  @ApiResponse({ status: 400, description: 'No file, or a disallowed MIME type' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — blog:write required' })
  @ApiResponse({ status: 413, description: 'File exceeds the 20 MB limit' })
  @ApiResponse({ status: 415, description: 'File contents are not a valid image' })
  uploadBlogCover(
    @CurrentUser('id') uploadedById: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file, uploadedById);
  }

  /**
   * The one implementation behind all four routes. They differ only in the
   * permission the guard demands — see the class docblock. It is the library's
   * own upload (TASK-2042), with no alt and no tags: a content form has neither
   * field, and the library screen is where they get curated.
   */
  private async storeContentImage(
    file: Express.Multer.File | undefined,
    uploadedById: string,
  ): Promise<UploadedImageResponseEnvelope> {
    const { url, blurDataUrl } = await this.media.upload(file, {}, uploadedById);
    return { data: { url, blurDataUrl } };
  }
}
