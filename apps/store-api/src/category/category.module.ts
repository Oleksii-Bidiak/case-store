import { Module } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { AdminCategoryController } from './admin-category.controller';

@Module({
  controllers: [CategoryController, AdminCategoryController],
  providers: [CategoryRepository, CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
