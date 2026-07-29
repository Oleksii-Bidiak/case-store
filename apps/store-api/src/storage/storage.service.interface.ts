import { StorageSubdir } from './storage-subdirs';

/**
 * Storage abstraction boundary.
 *
 * Iteration 1 (TASK-073) ships {@link LocalDiskStorageService}, which writes to
 * the NestJS server's local filesystem. Migrating to a CDN / object store later
 * (TASK-074) means writing one new class that implements this interface and
 * swapping the DI binding in {@link StorageModule} — no controller or service
 * changes required.
 */
export interface IStorageService {
  /**
   * Persist a file buffer under a whitelisted sub-directory and return the
   * storage-relative path (e.g. `products/<uuid>.webp`, `branding/<uuid>.svg`).
   * The public URL is assembled by the caller from this path + the configured
   * public base URL.
   */
  save(buffer: Buffer, ext: string, subdir: StorageSubdir): Promise<string>;

  /**
   * Read a previously-saved file back by its storage-relative path.
   *
   * Added for the catalogue import (TASK-360), which keeps the uploaded workbook
   * and re-reads it when the operator confirms the plan — the reviewable plan
   * carries value PREVIEWS, not 1300 full descriptions. Implementations MUST
   * throw when the file is missing: unlike a failed delete, a failed read means
   * the caller is about to act on data it does not have.
   */
  read(relativePath: string): Promise<Buffer>;

  /**
   * Remove a previously-saved file by its storage-relative path. Implementations
   * MUST NOT throw when the file is already gone — disk and DB can legitimately
   * diverge after a partial failure.
   */
  delete(relativePath: string): Promise<void>;
}

/** Injection token for {@link IStorageService}. */
export const STORAGE_SERVICE = 'STORAGE_SERVICE';
