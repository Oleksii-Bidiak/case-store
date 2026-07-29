import { Module } from '@nestjs/common';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportRepository } from './catalog-import.repository';
import { CatalogImportService } from './catalog-import.service';
import { CatalogImportWorker } from './catalog-import.worker';
import { ProductModule } from '../product';
import { StorageModule } from '../storage';

/**
 * Supplier-catalogue import (TASK-360).
 *
 * Depends on ProductModule rather than reaching for Prisma directly: every
 * product write goes through `ProductService` so that cache eviction, the
 * Meilisearch sync and slug-redirect recording happen exactly as they do for a
 * hand-edited product. A bulk path that bypassed them would leave the storefront
 * serving stale pages — the divergence TASK-293 was caught by.
 */
@Module({
  imports: [ProductModule, StorageModule],
  controllers: [CatalogImportController],
  providers: [CatalogImportRepository, CatalogImportService, CatalogImportWorker],
  exports: [CatalogImportService],
})
export class CatalogImportModule {}
