import { Module, forwardRef } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { AdminCategoryController } from './admin-category.controller';
import { SlugRedirectModule } from '../slug-redirect';
import { SearchModule } from '../search/search.module';

@Module({
  // SearchModule supplies the CategorySubtreeIndexer port (plan 158 §3.13.2) — a module
  // CYCLE (SearchModule imports CategoryModule for the ancestor expansion), so `forwardRef`
  // is required on BOTH sides.
  imports: [SlugRedirectModule, forwardRef(() => SearchModule)],
  controllers: [CategoryController, AdminCategoryController],
  providers: [CategoryRepository, CategoryService],
  // CategoryRepository is exported so ProductModule (subtree rollup, TASK-236-B)
  // and SearchModule (ancestor expansion, TASK-236-C) can inject its traversal
  // helpers without re-providing a second instance.
  exports: [CategoryService, CategoryRepository],
})
export class CategoryModule {}
