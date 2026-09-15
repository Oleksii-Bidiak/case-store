import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiExtraModels,
  ApiProperty,
} from '@nestjs/swagger';
import { AttributeDefinitionService } from './attribute-definition.service';
import { AttributeDefinitionEntity, FacetValueCountEntity, FilterableSpecEntity } from './entities';
import { FilterableSpecsQueryDto } from './dto';

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
@ApiExtraModels(
  AttributeDefinitionEntity,
  FacetValueCountEntity,
  FilterableSpecEntity,
  FilterableSpecsResponse,
)
@Controller('categories')
export class CategoryFacetController {
  constructor(private readonly service: AttributeDefinitionService) {}

  /**
   * GET /api/categories/:id/filterable-specs
   *
   * Returns the category's effective `isFilterable` definitions plus the values
   * in use across its subtree WITH the number of products behind each one —
   * enough for the storefront to render «Силікон (12)» without a second query
   * per value (TASK-489).
   *
   * The query string carries the shopper's OTHER active filters (brand, device,
   * price, search, availability, the other facets) because the counts are
   * relative to them: a facet endpoint that ignored them would publish numbers
   * the listing immediately contradicts.
   */
  @Get(':id/filterable-specs')
  @ApiOperation({
    summary: "List a category's filterable spec facets with product counts",
    operationId: 'categoryControllerGetFilterableSpecs',
  })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, type: FilterableSpecsResponse })
  async getFilterableSpecs(
    @Param('id') id: string,
    @Query() query: FilterableSpecsQueryDto,
  ): Promise<FilterableSpecsResponse> {
    return { data: await this.service.getFilterableSpecs(id, query) };
  }
}
