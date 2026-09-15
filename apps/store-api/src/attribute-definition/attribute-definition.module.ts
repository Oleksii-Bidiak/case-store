import { Module } from '@nestjs/common';
import { AttributeDefinitionRepository } from './attribute-definition.repository';
import { AttributeDefinitionService } from './attribute-definition.service';
import { AttributeDefinitionController } from './attribute-definition.controller';
import { CategoryFacetController } from './category-facet.controller';
import { CategoryModule } from '../category';
import { BrandModule } from '../brand';
import { DeviceModule } from '../device';
// Slug → id for the facet endpoint's active-filter params (TASK-489). Provided,
// not imported as a module — it is stateless, so a second instance costs
// nothing, and this is exactly how `ProductModule` and `SearchModule` take it.
import { CatalogueFilterResolver } from '../catalog-filter/catalogue-filter.resolver';

/**
 * Structured-spec template module (TASK-191, plan 112). Owns the per-category
 * `AttributeDefinition` templates and their subtree-inheritance resolution.
 * Imports {@link CategoryModule} for `CategoryRepository.findAncestorIds`;
 * exports the service + repository so `ProductModule` can resolve a product's
 * effective definitions when hydrating/validating its spec values.
 *
 * `BrandModule` / `DeviceModule` supply the two repositories
 * {@link CatalogueFilterResolver} needs. No cycle: nothing under `brand/`,
 * `device/`, `category/` or `search/` imports this module — the edge only ever
 * runs the other way, from `ProductModule` into here.
 */
@Module({
  imports: [CategoryModule, BrandModule, DeviceModule],
  controllers: [AttributeDefinitionController, CategoryFacetController],
  providers: [AttributeDefinitionRepository, AttributeDefinitionService, CatalogueFilterResolver],
  exports: [AttributeDefinitionService, AttributeDefinitionRepository],
})
export class AttributeDefinitionModule {}
