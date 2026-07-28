import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { ProductImageService } from './product-image.service';
import { ReorderImagesDto, UploadImagesDto } from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { ProductImageEntity } from './entities';

/** MIME types accepted by the upload endpoint. */
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Multer options for image uploads. Files are buffered in memory (no temp files);
 * the storage layer writes them to disk. The hard size cap bounds memory use; the
 * service enforces the stricter 5 MB business limit (→ 413).
 */
const imageMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ): void => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
    }
  },
};

/** Response envelope for an image list. */
class ProductImageListEnvelope {
  @ApiProperty({ type: [ProductImageEntity] })
  data!: ProductImageEntity[];
}

/**
 * Admin-only product image management. Mounted under the same `products` prefix
 * as ProductController; routes are sub-paths/methods that do not collide with the
 * public `GET /products/:slug`.
 */
@ApiTags('Products')
@Controller('products/:productId/images')
export class ProductImageController {
  constructor(private readonly imageService: ProductImageService) {}

  /**
   * GET /api/products/:productId/images
   * List a product's images (admin management view).
   */
  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('products:read')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List product images (admin)',
    operationId: 'productImageControllerList',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Product images', type: ProductImageListEnvelope })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async list(@Param('productId') productId: string): Promise<{ data: ProductImageEntity[] }> {
    const images = await this.imageService.listImages(productId);
    return { data: images };
  }

  /**
   * POST /api/products/:productId/images
   * Upload one or more images (multipart/form-data, field `files`). Admin-only.
   */
  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('products:write')
  @UseInterceptors(FilesInterceptor('files', 10, imageMulterOptions))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload product images (admin)',
    operationId: 'productImageControllerUpload',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        altTexts: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Images uploaded', type: ProductImageListEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid file (type/empty)' })
  @ApiResponse({ status: 413, description: 'File too large' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async upload(
    @Param('productId') productId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: UploadImagesDto,
  ): Promise<{ data: ProductImageEntity[] }> {
    const images = await this.imageService.uploadImages(productId, files, dto.altTexts);
    return { data: images };
  }

  /**
   * PATCH /api/products/:productId/images/reorder
   * Update sortOrder + primary flag for the product's images. Admin-only.
   */
  @Patch('reorder')
  @UseGuards(PermissionGuard)
  @RequirePermission('products:write')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Reorder product images (admin)',
    operationId: 'productImageControllerReorder',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 200, description: 'Images reordered' })
  @ApiResponse({ status: 400, description: 'Invalid payload (e.g. >1 primary)' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async reorder(
    @Param('productId') productId: string,
    @Body() dto: ReorderImagesDto,
  ): Promise<{ success: true }> {
    await this.imageService.reorderImages(productId, dto.items);
    return { success: true };
  }

  /**
   * DELETE /api/products/:productId/images/:imageId
   * Remove one image (DB row + stored file). Admin-only.
   */
  @Delete(':imageId')
  @UseGuards(PermissionGuard)
  @RequirePermission('products:write')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete a product image (admin)',
    operationId: 'productImageControllerDelete',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiParam({ name: 'imageId', description: 'Image UUID' })
  @ApiResponse({ status: 204, description: 'Image deleted' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Image or product not found' })
  async remove(
    @Param('productId') productId: string,
    @Param('imageId') imageId: string,
  ): Promise<void> {
    await this.imageService.deleteImage(productId, imageId);
  }
}
