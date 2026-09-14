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
import { CONTENT_SUBDIR } from '../storage/storage-subdirs';
import { ImageUploadService } from './image-upload.service';
import { imageMulterOptions } from './image-multer.options';
import { UploadedImageEntity, UploadedImageResponseEnvelope } from './entities';

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
 * subdir (`content`) and run the identical pipeline, so one parameterised route
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
  constructor(private readonly uploads: ImageUploadService) {}

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
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file);
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
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file);
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
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file);
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
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<UploadedImageResponseEnvelope> {
    return this.storeContentImage(file);
  }

  /**
   * The one implementation behind all four routes. They differ only in the
   * permission the guard demands — see the class docblock.
   */
  private async storeContentImage(
    file: Express.Multer.File | undefined,
  ): Promise<UploadedImageResponseEnvelope> {
    const { url, blurDataUrl } = await this.uploads.store(file, CONTENT_SUBDIR);
    return { data: { url, blurDataUrl } };
  }
}
