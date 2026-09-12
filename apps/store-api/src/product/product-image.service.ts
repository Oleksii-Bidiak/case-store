import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ProductRepository } from './product.repository';
import {
  CreateImageInput,
  ProductImageRepository,
  UpdateImageInput,
} from './product-image.repository';
import { ProductImageEntity } from './entities';
import {
  CacheService,
  productDetailIdKey,
  productDetailSlugKey,
  PRODUCT_LIST_PREFIX,
} from '../cache';
import { PRODUCTS_SUBDIR } from '../storage';
import { ImageUploadService } from '../uploads';
import { CATALOGUE_REVALIDATE_TARGET, RevalidationNotifier } from '../publishing';

/** A reorder instruction for one image. */
export interface ReorderImageInput {
  id: string;
  sortOrder: number;
  isPrimary: boolean;
}

/**
 * Orchestrates product image management: storage, persistence, and cache
 * eviction.
 *
 * File validation, the WebP/LQIP re-encode, the animated-GIF passthrough and the
 * public-URL assembly are NOT here — they live in {@link ImageUploadService},
 * the one image pipeline in this API (TASK-424). This service is about what makes
 * a product image a PRODUCT image: ownership, sort order, the primary flag, and
 * the caches a new photo invalidates.
 */
@Injectable()
export class ProductImageService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly imageRepository: ProductImageRepository,
    private readonly uploads: ImageUploadService,
    private readonly cache: CacheService,
    private readonly revalidation: RevalidationNotifier,
  ) {}

  /** List all images for a product, ordered for display. Admin management view. */
  async listImages(productId: string): Promise<ProductImageEntity[]> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.imageRepository.findByProductId(productId);
  }

  /**
   * Validate, store, and persist one or more uploaded images for a product. The
   * first image uploaded to a product with no existing images becomes primary.
   */
  async uploadImages(
    productId: string,
    files: Express.Multer.File[],
    altTexts: string[] = [],
  ): Promise<ProductImageEntity[]> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const maxSortOrder = await this.imageRepository.getMaxSortOrder(productId);
    const hasExisting = maxSortOrder >= 0;

    // The shared pipeline validates EVERY file before writing ANY of them, so a
    // rejected file in the middle of a batch leaves no orphaned bytes on disk.
    const stored = await this.uploads.storeAll(files, PRODUCTS_SUBDIR);

    const inputs: CreateImageInput[] = stored.map((image, i) => ({
      id: randomUUID(),
      productId,
      url: image.url,
      alt: altTexts[i] ?? null,
      blurDataUrl: image.blurDataUrl,
      sortOrder: maxSortOrder + 1 + i,
      isPrimary: !hasExisting && i === 0,
    }));

    await this.imageRepository.bulkCreate(inputs);
    await this.evictProductCaches(productId, product.slug);

    return inputs.map((input) =>
      ProductImageEntity.fromPrisma({
        id: input.id,
        url: input.url,
        alt: input.alt,
        blurDataUrl: input.blurDataUrl,
        sortOrder: input.sortOrder,
        isPrimary: input.isPrimary,
      }),
    );
  }

  /**
   * Update ordering and the primary flag for a product's images. At most one
   * image may be marked primary.
   */
  async reorderImages(productId: string, updates: ReorderImageInput[]): Promise<void> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const primaryCount = updates.filter((u) => u.isPrimary).length;
    if (primaryCount > 1) {
      throw new BadRequestException('At most one image can be primary');
    }

    const payload: UpdateImageInput[] = updates.map((u) => ({
      id: u.id,
      sortOrder: u.sortOrder,
      isPrimary: u.isPrimary,
    }));
    await this.imageRepository.updateMany(payload);
    await this.evictProductCaches(productId, product.slug);
  }

  /** Delete one image (DB row + stored file), enforcing product ownership. */
  async deleteImage(productId: string, imageId: string): Promise<void> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const image = await this.imageRepository.findById(imageId);
    if (!image || image.productId !== productId) {
      throw new NotFoundException('Image not found');
    }

    await this.imageRepository.delete(imageId);
    await this.uploads.removeByUrl(image.url);

    await this.evictProductCaches(productId, product.slug);
  }

  /**
   * Evict the product's detail caches (by id + slug), all list pages, and the
   * storefront's prerendered homepage.
   *
   * The storefront half matters most here, not least: uploading a new image or
   * promoting a different one to primary changes the picture the homepage
   * carousels show, and that picture is baked into static HTML. Without this the
   * admin sees the new photo everywhere except the one page customers land on
   * first (TASK-384). Best-effort — the purge can never fail an admin write.
   */
  private async evictProductCaches(productId: string, slug: string): Promise<void> {
    await this.cache.del(productDetailIdKey(productId));
    await this.cache.del(productDetailSlugKey(slug));
    await this.cache.delByPrefix(PRODUCT_LIST_PREFIX);
    try {
      await this.revalidation.revalidate(CATALOGUE_REVALIDATE_TARGET);
    } catch {
      // Swallowed: purging the storefront is never allowed to fail the write.
    }
  }
}
