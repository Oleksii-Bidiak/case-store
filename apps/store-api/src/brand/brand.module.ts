import { Module } from '@nestjs/common';
import { BrandRepository } from './brand.repository';
import { BrandService } from './brand.service';
import { BrandController } from './brand.controller';
import { AdminBrandController } from './admin-brand.controller';

/**
 * Brand module (TASK-189). Exports {@link BrandRepository} so ProductModule can
 * validate an unknown `brandId` on product create/update without re-providing a
 * second instance.
 */
@Module({
  controllers: [BrandController, AdminBrandController],
  providers: [BrandRepository, BrandService],
  exports: [BrandService, BrandRepository],
})
export class BrandModule {}
