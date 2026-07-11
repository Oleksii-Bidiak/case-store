import { Module } from '@nestjs/common';
import { CarouselRepository } from './carousels.repository';
import { CarouselService } from './carousels.service';
import { CarouselController } from './carousels.controller';
import { AdminCarouselController } from './admin-carousels.controller';
import { ProductModule } from '../product/product.module';
import { CategoryModule } from '../category';
import { PUBLISHABLE_REPOSITORY } from '../publishing';

@Module({
  imports: [ProductModule, CategoryModule],
  controllers: [CarouselController, AdminCarouselController],
  providers: [
    CarouselRepository,
    CarouselService,
    // Register CarouselRepository as a scheduled publisher under the shared token
    // so the PublishingScheduler flips due SCHEDULED carousels live. The scheduler
    // collects every module's token provider via DiscoveryService — Nest has no
    // Angular-style `multi`, so one `useExisting` alias per content module is the
    // registration mechanism.
    { provide: PUBLISHABLE_REPOSITORY, useExisting: CarouselRepository },
  ],
  exports: [CarouselService],
})
export class CarouselsModule {}
