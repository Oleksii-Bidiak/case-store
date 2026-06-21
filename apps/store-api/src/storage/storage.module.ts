import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocalDiskStorageService } from './local-disk-storage.service';
import { STORAGE_SERVICE } from './storage.service.interface';

/**
 * Provides the storage abstraction. Iteration 1 binds {@link STORAGE_SERVICE}
 * to {@link LocalDiskStorageService}. Swapping to a CDN provider (TASK-074) is a
 * one-line `useClass` change here.
 */
@Module({
  imports: [ConfigModule],
  providers: [{ provide: STORAGE_SERVICE, useClass: LocalDiskStorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
