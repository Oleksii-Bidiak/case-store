// Attribute Definition Module — public API
export { AttributeDefinitionModule } from './attribute-definition.module';
export { AttributeDefinitionService } from './attribute-definition.service';
export { AttributeDefinitionRepository } from './attribute-definition.repository';
export {
  type CreateAttributeDefinitionInput,
  type UpdateAttributeDefinitionInput,
  type FacetValueCount,
} from './attribute-definition.repository';
export {
  AttributeDefinitionEntity,
  FacetValueCountEntity,
  FilterableSpecEntity,
  FacetCeilingCategoryEntity,
  FacetCeilingReportEntity,
} from './entities';
export {
  CreateAttributeDefinitionDto,
  UpdateAttributeDefinitionDto,
  ReorderAttributeDefinitionsDto,
  FilterableSpecsQueryDto,
} from './dto';
export {
  ATTRIBUTE_KEY_PATTERN,
  MAX_HIGHLIGHTS,
  FACETABLE_TYPES,
  isFacetableType,
} from './attribute-definition.constants';
