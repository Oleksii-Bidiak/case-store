// Attribute Definition Module — public API
export { AttributeDefinitionModule } from './attribute-definition.module';
export { AttributeDefinitionService } from './attribute-definition.service';
export { AttributeDefinitionRepository } from './attribute-definition.repository';
export {
  CreateAttributeDefinitionInput,
  UpdateAttributeDefinitionInput,
} from './attribute-definition.repository';
export { AttributeDefinitionEntity, FilterableSpecEntity } from './entities';
export {
  CreateAttributeDefinitionDto,
  UpdateAttributeDefinitionDto,
  ReorderAttributeDefinitionsDto,
} from './dto';
export { ATTRIBUTE_KEY_PATTERN, MAX_HIGHLIGHTS } from './attribute-definition.constants';
