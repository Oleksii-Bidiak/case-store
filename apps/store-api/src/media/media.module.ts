import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaRepository } from './media.repository';
import { MediaUsageRepository } from './media-usage.repository';

/**
 * The internal media library (TASK-441, plan 177).
 *
 * Imports {@link UploadsModule} rather than wiring storage itself: there is ONE
 * image pipeline in this API (TASK-424), and the library is a caller of it, not
 * a second copy.
 */
@Module({
  imports: [UploadsModule],
  controllers: [MediaController],
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
