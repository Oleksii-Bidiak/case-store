import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads';
import { MediaController } from './media.controller';
import { UploadsController } from './content-uploads.controller';
import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { MediaUsageRepository } from './media-usage.repository';

/**
 * The internal media library (TASK-441, plan 177).
 *
 * Imports {@link UploadsModule} rather than wiring storage itself: there is ONE
 * image pipeline in this API (TASK-424), and the library is a caller of it, not
 * a second copy.
 *
 * {@link UploadsController} (`/admin/uploads/<kind>`) is registered here, not in
 * `UploadsModule`, because every content-field upload records a library asset
 * through {@link MediaService} (TASK-2042) — and `UploadsModule` cannot import
 * this module back.
 */
@Module({
  imports: [UploadsModule],
  controllers: [MediaController, UploadsController],
  providers: [MediaService, MediaRepository, MediaUsageRepository],
  // `MediaRepository` is exported (mirroring DeviceModule) so `ProductImageService`
  // can look an asset up when attaching it to a gallery, without a second Prisma
  // call site for `media_assets` (TASK-441). `MediaUsageRepository` goes with it
  // (TASK-585): deleting a gallery row is the second path to the same stored
  // file, so it needs the same "is anything still pointing at this?" answer that
  // `MediaService.delete` uses — one implementation, not two.
  exports: [MediaService, MediaRepository, MediaUsageRepository],
})
export class MediaModule {}
