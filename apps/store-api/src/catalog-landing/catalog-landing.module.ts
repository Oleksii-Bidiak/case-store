import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { DeviceModule } from '../device/device.module';
import { CatalogLandingController } from './catalog-landing.controller';
import { CatalogLandingRepository } from './catalog-landing.repository';
import { CatalogLandingService } from './catalog-landing.service';

/**
 * CatalogLandingModule — the compatibility landing pages `/catalog/<категорія>/
 * <модель>` (TASK-490, plan 182 F3).
 *
 * Its own module rather than a pair of routes bolted onto `ProductModule` or
 * `DeviceModule`, because the thing it owns is neither: it is the CROSS of a
 * category and a device model, and it answers a question — "which of these pairs
 * is a page?" — that neither aggregate can answer alone. It imports both
 * taxonomies read-only (`CategoryRepository` for the subtree/ancestor walks,
 * `DeviceRepository` for the models) and adds no edge to the
 * Category↔Search `forwardRef` cycle, since nothing imports it back.
 */
@Module({
  imports: [CategoryModule, DeviceModule],
  controllers: [CatalogLandingController],
  providers: [CatalogLandingRepository, CatalogLandingService],
  exports: [CatalogLandingService],
})
export class CatalogLandingModule {}
