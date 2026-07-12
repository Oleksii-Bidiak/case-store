// Category Module — public API
export { CategoryModule } from './category.module';
export { CategoryService } from './category.service';
export { CategoryController } from './category.controller';
export { AdminCategoryController } from './admin-category.controller';
export {
  CategoryRepository,
  FindAllParams as CategoryFindAllParams,
  FindRootParams,
  CreateCategoryInput,
  UpdateCategoryInput,
  PaginatedCategoriesResult,
  CategoryWithCountResult,
  PaginatedCategoriesWithCountResult,
  TreeMovesResult,
  CategoryUpdateResult,
} from './category.repository';
export { CategoryEntity, CategoryTreeNodeEntity, CategoryWithCountEntity } from './entities';
export { CreateCategoryDto, UpdateCategoryDto, CategoryListQueryDto } from './dto';
