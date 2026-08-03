import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { IStorageService, ImageProcessor, PRODUCTS_SUBDIR, STORAGE_SERVICE } from '../storage';
import { CATALOGUE_REVALIDATE_TARGET, RevalidationNotifier } from '../publishing';

/** Allowed image MIME types mapped to their canonical file extension. */
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Animated GIFs are passed through untouched: re-encoding to a single WebP frame
 * would kill the animation, so they keep their original bytes/extension and get
 * no LQIP (TASK-091).
 */
const GIF_MIME = 'image/gif';

/** Maximum accepted file size (bytes). Mirrors the Multer limit on the controller. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The URL path segment under which images are served (ServeStaticModule root). */
const PUBLIC_UPLOADS_PREFIX = '/uploads/';

/** A reorder instruction for one image. */
export interface ReorderImageInput {
  id: string;
  sortOrder: number;
  isPrimary: boolean;
}

/**
 * Orchestrates product image management: file validation, storage, persistence,
 * and cache eviction. The storage backend is injected via {@link STORAGE_SERVICE}
 * so this service is unaware of whether files live on disk or a CDN.
 */
@Injectable()
export class ProductImageService {
  private readonly publicBaseUrl: string;

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly imageRepository: ProductImageRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly imageProcessor: ImageProcessor,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
    private readonly revalidation: RevalidationNotifier,
  ) {
    this.publicBaseUrl = (
      this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:3001'
    ).replace(/\/+$/, '');
  }

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

    // Validate every file before writing anything to disk.
    for (const file of files) {
      this.assertValidFile(file);
    }

    const maxSortOrder = await this.imageRepository.getMaxSortOrder(productId);
    const hasExisting = maxSortOrder >= 0;

    const inputs: CreateImageInput[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { buffer, ext, blurDataUrl } = await this.prepareFile(file);
      const relativePath = await this.storage.save(buffer, ext, PRODUCTS_SUBDIR);
      inputs.push({
        id: randomUUID(),
        productId,
        url: `${this.publicBaseUrl}${PUBLIC_UPLOADS_PREFIX}${relativePath}`,
        alt: altTexts[i] ?? null,
        blurDataUrl,
        sortOrder: maxSortOrder + 1 + i,
        isPrimary: !hasExisting && i === 0,
      });
    }

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
   * Pre-process one accepted upload for storage. JPEG/PNG/WebP are re-encoded to
   * WebP (smaller payload) with a base64 LQIP for blur-up; animated GIFs are
   * passed through untouched with no LQIP so the animation survives.
   *
   * The GIF branch is the only path that writes client bytes to disk verbatim, so
   * it cannot trust the declared MIME type: the buffer is sniffed with `sharp`
   * first. Without that, any file (an HTML/JS polyglot) uploaded as `image/gif`
   * would be stored and then served from our own origin.
   */
  private async prepareFile(
    file: Express.Multer.File,
  ): Promise<{ buffer: Buffer; ext: string; blurDataUrl: string | null }> {
    if (file.mimetype === GIF_MIME) {
      const format = await this.imageProcessor.detectFormat(file.buffer);
      if (format !== 'gif') {
        throw new UnsupportedMediaTypeException('File contents are not a valid GIF image');
      }
      return { buffer: file.buffer, ext: ALLOWED_MIME_EXT[GIF_MIME], blurDataUrl: null };
    }
    const { webp, blurDataUrl } = await this.imageProcessor.process(file.buffer);
    return { buffer: webp, ext: 'webp', blurDataUrl };
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

    const relativePath = this.toRelativePath(image.url);
    if (relativePath) {
      await this.storage.delete(relativePath);
    }

    await this.evictProductCaches(productId, product.slug);
  }

  /** Reject files with a disallowed MIME type or that exceed the size cap. */
  private assertValidFile(file: Express.Multer.File): void {
    if (!ALLOWED_MIME_EXT[file.mimetype]) {
      throw new UnsupportedMediaTypeException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${Object.keys(ALLOWED_MIME_EXT).join(', ')}`,
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new PayloadTooLargeException('File exceeds the 5 MB limit');
    }
  }

  /** Convert a stored public URL back to its storage-relative path, or null. */
  private toRelativePath(url: string): string | null {
    const idx = url.indexOf(PUBLIC_UPLOADS_PREFIX);
    return idx >= 0 ? url.slice(idx + PUBLIC_UPLOADS_PREFIX.length) : null;
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
