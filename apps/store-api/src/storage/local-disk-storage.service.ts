import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { IStorageService } from './storage.service.interface';
import { isStorageSubdir, StorageSubdir } from './storage-subdirs';

/** Extensions are produced by our own pipeline; refuse anything that could alter the path. */
const SAFE_EXT = /^[a-z0-9]{1,8}$/;

/**
 * Local-filesystem implementation of {@link IStorageService}.
 *
 * Files are written to `<UPLOAD_DEST>/<subdir>/<uuid>.<ext>`, where `subdir` is
 * one of the whitelisted {@link STORAGE_SUBDIRS}. The directory is created lazily
 * on first save. NestJS serves the UPLOAD_DEST root statically at `/uploads`
 * (see ServeStaticModule in AppModule), so the relative path returned here maps
 * directly onto the public URL.
 */
@Injectable()
export class LocalDiskStorageService implements IStorageService {
  private readonly logger = new Logger(LocalDiskStorageService.name);
  private readonly uploadRoot: string;

  constructor(private readonly config: ConfigService) {
    this.uploadRoot = resolve(this.config.get<string>('UPLOAD_DEST', './uploads'));
  }

  async save(buffer: Buffer, ext: string, subdir: StorageSubdir): Promise<string> {
    if (!isStorageSubdir(subdir)) {
      throw new Error(`Refusing to write to a non-whitelisted sub-directory: ${subdir}`);
    }
    if (!SAFE_EXT.test(ext)) {
      throw new Error(`Refusing to write a file with an unsafe extension: ${ext}`);
    }

    const dir = join(this.uploadRoot, subdir);
    await mkdir(dir, { recursive: true });

    const filename = `${randomUUID()}.${ext}`;
    await writeFile(join(dir, filename), buffer);

    // Forward slashes: this is a URL-relative path, not an OS path.
    return `${subdir}/${filename}`;
  }

  async read(relativePath: string): Promise<Buffer> {
    // Same traversal guard as `delete`, but a violation THROWS rather than
    // warning: a read that silently returns nothing would let the caller act on
    // data it never actually loaded.
    const absolute = this.resolveInsideRoot(relativePath);
    if (!absolute) {
      throw new Error(`Refusing to read path outside a known sub-directory: ${relativePath}`);
    }
    return readFile(absolute);
  }

  async delete(relativePath: string): Promise<void> {
    const absolute = this.resolveInsideRoot(relativePath);
    if (!absolute) {
      this.logger.warn(`Refusing to delete path outside a known sub-directory: ${relativePath}`);
      return;
    }

    try {
      await unlink(absolute);
    } catch (err) {
      // File already gone (disk/DB divergence) is not an error worth failing on.
      this.logger.warn(`Could not delete file ${relativePath}: ${(err as Error).message}`);
    }
  }

  /**
   * Resolve a storage-relative path to an absolute one, or null when it escapes
   * the whitelisted sub-directories. Shared by `read` and `delete` so the two
   * can never drift on what counts as a safe path.
   */
  private resolveInsideRoot(relativePath: string): string | null {
    const [subdir] = relativePath.split('/');
    if (!isStorageSubdir(subdir)) {
      return null;
    }

    const subdirRoot = join(this.uploadRoot, subdir);
    const absolute = resolve(this.uploadRoot, relativePath);
    // The trailing separator matters: a bare `startsWith(subdirRoot)` would also
    // accept a sibling directory such as `<uploadRoot>/products-evil`.
    return absolute.startsWith(subdirRoot + sep) ? absolute : null;
  }
}
