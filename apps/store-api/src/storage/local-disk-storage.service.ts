import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { IStorageService } from './storage.service.interface';

/**
 * The sub-directory (under UPLOAD_DEST) where product images live. Kept as a
 * constant so the storage layer owns the on-disk layout and the served URL
 * (`/uploads/products/<file>`) stays consistent.
 */
export const PRODUCTS_SUBDIR = 'products';

/**
 * Local-filesystem implementation of {@link IStorageService}.
 *
 * Files are written to `<UPLOAD_DEST>/products/<uuid>.<ext>`. The directory is
 * created lazily on first save. NestJS serves the UPLOAD_DEST root statically at
 * `/uploads` (see ServeStaticModule in AppModule), so the relative path returned
 * here maps directly onto the public URL.
 */
@Injectable()
export class LocalDiskStorageService implements IStorageService {
  private readonly logger = new Logger(LocalDiskStorageService.name);
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = resolve(this.config.get<string>('UPLOAD_DEST', './uploads'));
  }

  async save(buffer: Buffer, ext: string): Promise<string> {
    const dir = join(this.uploadRoot, PRODUCTS_SUBDIR);
    await mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, filename), buffer);

    // Forward slashes: this is a URL-relative path, not an OS path.
    return `${PRODUCTS_SUBDIR}/${filename}`;
  }

  async delete(relativePath: string): Promise<void> {
    // Guard against path traversal — only ever touch files inside uploadRoot.
    const absolute = resolve(this.uploadRoot, relativePath);
    if (!absolute.startsWith(this.uploadRoot)) {
      this.logger.warn(`Refusing to delete path outside upload root: ${relativePath}`);
      return;
    }
    try {
      await unlink(absolute);
    } catch (err) {
      // File already gone (disk/DB divergence) is not an error worth failing on.
      this.logger.warn(`Could not delete file ${relativePath}: ${(err as Error).message}`);
    }
  }
}
