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
import { MediaRepository, MediaUsageRepository } from '../media';
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
    // The media library's own repository, injected the way `ProductService`
    // already injects `DeviceRepository` / `CategoryRepository` — one owner per
    // table, no second Prisma call site for `media_assets` (TASK-441).
    private readonly mediaRepository: MediaRepository,
    // Same repository `MediaService.delete` uses to refuse a delete while
    // something still references the file. Injected here because deleting a
    // gallery row is the SECOND way to reach the same bytes (TASK-585).
    private readonly mediaUsage: MediaUsageRepository,
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
   * Attach a picture that is ALREADY in the media library to this product
   * (TASK-441).
   *
   * WHY THIS EXISTS AT ALL. Every other image field in the admin is a URL
   * string, so "use the library instead of uploading again" is a `setValue`
   * there. A product gallery is not a string: it is a row in `product_images`
   * with a sort order and a cover flag, and until now the ONLY way to create one
   * was to post a file. Without this route the media picker would work in five
   * places out of six, and the one place operators re-upload the same photo most
   * — a phone case shot reused across colour variants — would be the exception.
   *
   * NOTHING IS COPIED. One file on disk, one URL, two rows pointing at it: that
   * is the whole point of a library, and it is also why `MediaService.delete`
   * refuses while anything references the URL. Re-storing the bytes under a new
   * name would give the operator a second asset that looks identical and a
   * library that grows with every reuse.
   *
   * The sort/primary rules are the upload path's, verbatim — first picture of a
   * product with none becomes the cover, everything else goes on the end — so a
   * gallery cannot behave one way for uploaded photos and another for picked
   * ones. `mediaAssetId` is recorded as PROVENANCE only; see the schema note on
   * why usage is still computed by URL and never read off this column.
   */
  async attachAsset(productId: string, mediaAssetId: string): Promise<ProductImageEntity> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const asset = await this.mediaRepository.findById(mediaAssetId);
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }

    const maxSortOrder = await this.imageRepository.getMaxSortOrder(productId);

    const image = await this.imageRepository.create({
      id: randomUUID(),
      productId,
      url: asset.url,
      // The asset's own alt text comes with it. An operator who curated it once
      // in the library should not have to retype it per product — and a gallery
      // row with no alt is the accessibility defect the library was meant to fix.
      alt: asset.alt,
      blurDataUrl: asset.blurDataUrl,
      sortOrder: maxSortOrder + 1,
      isPrimary: maxSortOrder < 0,
      mediaAssetId: asset.id,
    });

    await this.evictProductCaches(productId, product.slug);

    return image;
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

  /**
   * Delete one image, enforcing product ownership. The stored FILE goes only if
   * this row was the last thing pointing at it (TASK-585).
   *
   * WHY THE ROW AND THE FILE ARE NOW TWO DECISIONS. Until TASK-441 a gallery row
   * owned its bytes outright: the only way to make one was to post a file, so
   * one row meant one file and deleting the row meant deleting the file. The
   * media library breaks that one-to-one — {@link attachAsset} exists precisely
   * so one stored photo can back several galleries ("the same case shot across
   * colour variants"), and the TASK-441 backfill turned every photo that already
   * existed into a library asset. Deleting unconditionally therefore pulls the
   * file out from under a live product page, or leaves the library holding a row
   * whose file is gone — the broken-thumbnail outcome that
   * {@link MediaService.delete} calls the worse of the two orders.
   *
   * BOTH QUESTIONS ARE ANSWERED BY URL, NEVER BY `mediaAssetId`. That column is
   * provenance and nothing else: the importer, the seed and every pre-TASK-441
   * upload leave it null, so a check reading it would call a photo-bearing asset
   * unused and delete the file anyway (see the note on `ProductImage.mediaAssetId`
   * in `schema.prisma`). The library lookup goes first because it is one indexed
   * hit on a UNIQUE column and, after the backfill, it is the answer for almost
   * every photo — the broader sweep is only paid for a direct upload.
   */
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
    if (await this.isLastReferenceToFile(image.url)) {
      await this.uploads.removeByUrl(image.url);
    }

    await this.evictProductCaches(productId, product.slug);
  }

  /**
   * Whether the stored file behind `url` is now unreferenced and safe to remove.
   *
   * Call it AFTER the row is deleted: the usage sweep reads the same tables, so
   * the row being removed must already be gone or it would count itself.
   */
  private async isLastReferenceToFile(url: string): Promise<boolean> {
    // A library asset owns its bytes. Removing them here would leave `/media`
    // showing a thumbnail that 404s, and the library is where such a file is
    // meant to be deleted — behind `MediaService.delete`'s own usage gate.
    if (await this.mediaRepository.findByUrl(url)) {
      return false;
    }
    const stillUsed = await this.mediaUsage.findUsageForUrl(url);
    return stillUsed.length === 0;
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
