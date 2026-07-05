import { Module } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { AdminCategoryController } from './admin-category.controller';

@Module({
  controllers: [CategoryController, AdminCategoryController],
  providers: [CategoryRepository, CategoryService],
  // CategoryRepository is exported so ProductModule (subtree rollup, TASK-236-B)
  // and SearchModule (ancestor expansion, TASK-236-C) can inject its traversal
  // helpers without re-providing a second instance.
  exports: [CategoryService, CategoryRepository],
})
export class CategoryModule {}
