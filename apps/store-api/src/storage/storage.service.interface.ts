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
   * Persist a file buffer and return the storage-relative path
   * (e.g. `products/<uuid>.jpg`). The public URL is assembled by the caller
   * from this path + the configured public base URL.
   */
  save(buffer: Buffer, ext: string): Promise<string>;

  /**
   * Remove a previously-saved file by its storage-relative path. Implementations
   * MUST NOT throw when the file is already gone — disk and DB can legitimately
   * diverge after a partial failure.
   */
  delete(relativePath: string): Promise<void>;
}

/** Injection token for {@link IStorageService}. */
export const STORAGE_SERVICE = 'STORAGE_SERVICE';
