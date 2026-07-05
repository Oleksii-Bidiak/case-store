import { Module } from '@nestjs/common';
import { BannerRepository } from './banners.repository';
import { BannerService } from './banners.service';
import { BannerController } from './banners.controller';
import { AdminBannerController } from './admin-banners.controller';
import { PUBLISHABLE_REPOSITORY } from '../publishing';

@Module({
  controllers: [BannerController, AdminBannerController],
  providers: [
    BannerRepository,
    BannerService,
    // Register BannerRepository as a scheduled publisher under the shared token so
    // the PublishingScheduler flips due SCHEDULED banners live. The scheduler
    // collects every module's token provider via DiscoveryService — Nest has no
    // Angular-style `multi`, so one `useExisting` alias per content module is the
    // registration mechanism.
    { provide: PUBLISHABLE_REPOSITORY, useExisting: BannerRepository },
  ],
  exports: [BannerService],
})
export class BannersModule {}
