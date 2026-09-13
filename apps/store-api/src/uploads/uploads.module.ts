import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '../storage';
import { ImageUploadService } from './image-upload.service';
import { UploadsController } from './uploads.controller';

/**
 * The shared image-upload pipeline (TASK-424) plus the four admin routes that
 * expose it for content imagery.
 *
 * {@link ImageUploadService} is exported because `ProductModule` uses it for the
 * product gallery — there is one pipeline in this API, not one per caller. It is
 * also the seam plan 177's media library plugs into.
 */
@Module({
  imports: [ConfigModule, StorageModule],
  controllers: [UploadsController],
  providers: [ImageUploadService],
  exports: [ImageUploadService],
})
export class UploadsModule {}
