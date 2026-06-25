import { Module } from '@nestjs/common';
import { ProductGroupRepository } from './product-group.repository';
import { ProductGroupService } from './product-group.service';
import { ProductGroupController } from './product-group.controller';

/**
 * Product group management module (TASK-142). Provides admin CRUD for the groups
 * that link sibling product positions and declare their attribute axes.
 */
@Module({
  controllers: [ProductGroupController],
  providers: [ProductGroupRepository, ProductGroupService],
  exports: [ProductGroupService],
})
export class ProductGroupModule {}
