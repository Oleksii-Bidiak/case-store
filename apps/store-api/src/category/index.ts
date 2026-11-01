// Category Module — public API
export { CategoryModule } from './category.module';
export { CategoryService } from './category.service';
export {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_API_PROPERTY,
  toCategoryIconKey,
  type CategoryIconKey,
} from './category-icons';
export {
  CategoryRepository,
  type FindAllParams as CategoryFindAllParams,
  type FindRootParams,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type PaginatedCategoriesResult,
  type CategoryWithCountResult,
  type PaginatedCategoriesWithCountResult,
  type TreeMovesResult,
  type CategoryUpdateResult,
  type CategoryDeletionTarget,
  type CategoryDeletionResult,
  type CategoryDeletionImpact,
} from './category.repository';
export {
  AdminCategoryDetailEntity,
  CategoryDeletionImpactEntity,
  CategoryEntity,
  CategoryTreeNodeEntity,
  CategoryWithCountEntity,
} from './entities';
export {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryListQueryDto,
  DeleteCategoryDto,
  DeleteCategoryMoveToNewDto,
} from './dto';
