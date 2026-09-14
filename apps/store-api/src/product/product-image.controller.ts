import {
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
import { ProductImageService } from './product-image.service';
import { AttachImageDto, ReorderImagesDto, UploadImagesDto } from './dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { ProductImageEntity } from './entities';
import { imageMulterOptions, MAX_FILES_PER_UPLOAD } from '../uploads';

/**
 * Multer options for the gallery upload — the shared image-upload config
 * (TASK-424), so the accepted MIME set and the memory-storage rule are the same
 * here as on every other upload route in the API.
 */
const galleryMulterOptions = imageMulterOptions(MAX_FILES_PER_UPLOAD);

/** Response envelope for an image list. */
class ProductImageListEnvelope {
  @ApiProperty({ type: [ProductImageEntity] })
  data!: ProductImageEntity[];
}

/** Response envelope for the single row an attach creates. */
class ProductImageEnvelope {
  @ApiProperty({ type: ProductImageEntity })
  data!: ProductImageEntity;
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
  @UseInterceptors(FilesInterceptor('files', MAX_FILES_PER_UPLOAD, galleryMulterOptions))
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
  @ApiResponse({ status: 413, description: 'File exceeds the 20 MB limit' })
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
   * POST /api/products/:productId/images/attach
   * Add an image that already exists in the media library. Admin-only.
   *
   * A sibling of the upload route rather than a mode of it: the request is JSON,
   * not multipart, nothing is validated or written to disk, and the two have
   * nothing in common past the row they end up creating. Folding "either a file
   * or an id" into one handler would mean a multipart endpoint whose body is
   * sometimes not multipart, and a Swagger schema that lies to Orval about both.
   */
  @Post('attach')
  @UseGuards(PermissionGuard)
  @RequirePermission('products:write')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Attach a media-library image to a product (admin)',
    operationId: 'productImageControllerAttach',
  })
  @ApiParam({ name: 'productId', description: 'Product UUID' })
  @ApiResponse({ status: 201, description: 'Image attached', type: ProductImageEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid payload (mediaAssetId is not a UUID)' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden — products:write required' })
  @ApiResponse({ status: 404, description: 'Product or media asset not found' })
  async attach(
    @Param('productId') productId: string,
    @Body() dto: AttachImageDto,
  ): Promise<{ data: ProductImageEntity }> {
    const image = await this.imageService.attachAsset(productId, dto.mediaAssetId);
    return { data: image };
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
