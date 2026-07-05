import { Module } from '@nestjs/common';
import { AttributeDefinitionRepository } from './attribute-definition.repository';
import { AttributeDefinitionService } from './attribute-definition.service';
import { AttributeDefinitionController } from './attribute-definition.controller';
import { CategoryFacetController } from './category-facet.controller';
import { CategoryModule } from '../category';

/**
 * Structured-spec template module (TASK-191, plan 112). Owns the per-category
 * `AttributeDefinition` templates and their subtree-inheritance resolution.
 * Imports {@link CategoryModule} for `CategoryRepository.findAncestorIds`;
 * exports the service + repository so `ProductModule` can resolve a product's
 * effective definitions when hydrating/validating its spec values.
 */
@Module({
  imports: [CategoryModule],
  controllers: [AttributeDefinitionController, CategoryFacetController],
  providers: [AttributeDefinitionRepository, AttributeDefinitionService],
  exports: [AttributeDefinitionService, AttributeDefinitionRepository],
})
export class AttributeDefinitionModule {}
