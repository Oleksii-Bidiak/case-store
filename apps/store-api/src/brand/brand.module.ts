import { Module } from '@nestjs/common';
import { BrandRepository } from './brand.repository';
import { BrandService } from './brand.service';
import { BrandController } from './brand.controller';
import { AdminBrandController } from './admin-brand.controller';
// Direct file import (NOT the '../category' barrel), matching SearchModule: the
// category module sits in a forwardRef cycle with SearchModule, and routing this
// edge through barrels risks `design:paramtypes` resolving to `Object`.
import { CategoryModule } from '../category/category.module';

/**
 * Brand module (TASK-189). Exports {@link BrandRepository} so ProductModule can
 * validate an unknown `brandId` on product create/update without re-providing a
 * second instance.
 *
 * CategoryModule supplies `CategoryRepository` for the per-category brand list's
 * subtree expansion (TASK-414). No cycle: nothing under `category/` or
 * `search/` imports BrandModule.
 */
@Module({
  imports: [CategoryModule],
  controllers: [BrandController, AdminBrandController],
  providers: [BrandRepository, BrandService],
  exports: [BrandService, BrandRepository],
})
export class BrandModule {}
