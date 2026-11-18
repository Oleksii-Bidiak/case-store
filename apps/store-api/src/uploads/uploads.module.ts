import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../storage';
import { ImageUploadService } from './image-upload.service';

/**
 * The shared image-upload pipeline (TASK-424).
 *
 * {@link ImageUploadService} is exported because `ProductModule` uses it for the
 * product gallery — there is one pipeline in this API, not one per caller. It is
 * also the seam plan 177's media library plugs into. The four content-image
 * routes (`/admin/uploads/<kind>`) are registered in `MediaModule` since
 * TASK-2042, because each of them now records a library asset.
 */
@Module({
  imports: [ConfigModule, StorageModule],
  providers: [ImageUploadService],
  exports: [ImageUploadService],
})
export class UploadsModule {}
