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
  exports: [MediaService],
})
export class MediaModule {}
