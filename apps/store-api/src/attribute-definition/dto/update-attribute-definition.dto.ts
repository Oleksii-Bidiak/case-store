import { PartialType } from '@nestjs/swagger';
import { CreateAttributeDefinitionDto } from './create-attribute-definition.dto';

/**
 * DTO for updating a structured-spec template (admin-only). Every field is
 * optional; `categoryId` is never editable (a definition stays on its category).
 */
export class UpdateAttributeDefinitionDto extends PartialType(CreateAttributeDefinitionDto) {}
