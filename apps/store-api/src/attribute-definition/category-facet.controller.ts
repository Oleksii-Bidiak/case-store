import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiExtraModels,
  ApiProperty,
} from '@nestjs/swagger';
import { AttributeDefinitionService } from './attribute-definition.service';
import { AttributeDefinitionEntity, FilterableSpecEntity } from './entities';

/** Response envelope for a category's filterable-spec facets. */
class FilterableSpecsResponse {
  @ApiProperty({ type: [FilterableSpecEntity] })
  data!: FilterableSpecEntity[];
}

/**
 * PUBLIC controller for structured-spec catalog facets (TASK-191). Separate
 * from the admin {@link AttributeDefinitionController} (which is guarded at the
 * class level) so this read-only endpoint stays open to the storefront. Lives in
 * the attribute-definition module — where the spec data and effective-definition
 * resolution live — to avoid a Category ↔ AttributeDefinition module cycle.
 */
@ApiTags('Categories')
@ApiExtraModels(AttributeDefinitionEntity, FilterableSpecEntity, FilterableSpecsResponse)
@Controller('categories')
export class CategoryFacetController {
  constructor(private readonly service: AttributeDefinitionService) {}

  /**
   * GET /api/categories/:id/filterable-specs
   *
   * Returns the category's effective `isFilterable` definitions plus the
   * distinct values in use across its subtree — enough for the storefront to
   * render facet select controls without a second "distinct values" query.
   */
  @Get(':id/filterable-specs')
  @ApiOperation({
    summary: "List a category's filterable spec facets",
    operationId: 'categoryControllerGetFilterableSpecs',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, type: FilterableSpecsResponse })
  async getFilterableSpecs(@Param('id') id: string): Promise<FilterableSpecsResponse> {
    return { data: await this.service.getFilterableSpecs(id) };
  }
}
