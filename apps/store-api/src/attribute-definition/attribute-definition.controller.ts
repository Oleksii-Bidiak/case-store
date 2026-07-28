import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiExtraModels,
  ApiProperty,
} from '@nestjs/swagger';
import { AttributeDefinitionService } from './attribute-definition.service';
import {
  CreateAttributeDefinitionDto,
  UpdateAttributeDefinitionDto,
  ReorderAttributeDefinitionsDto,
} from './dto';
import { AttributeDefinitionEntity } from './entities';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/** Response envelope for a single attribute definition. */
class AttributeDefinitionResponse {
  @ApiProperty({ type: AttributeDefinitionEntity })
  data!: AttributeDefinitionEntity;
}

/** Response envelope for a list of attribute definitions. */
class AttributeDefinitionListResponse {
  @ApiProperty({ type: [AttributeDefinitionEntity] })
  data!: AttributeDefinitionEntity[];
}

/** Response envelope for a delete acknowledgement. */
class AttributeDefinitionDeleteResponse {
  @ApiProperty({ example: { id: '550e8400-e29b-41d4-a716-446655440000' } })
  data!: { id: string };
}

/**
 * Admin-only controller for per-category structured-spec TEMPLATES (TASK-191).
 * Templates are an authoring concern and never public — every route is behind
 * {@link PermissionGuard} requiring `attributes:write`. The filled-in product
 * VALUES live on the product module
 * (`PUT /products/:id/specs`); this controller only manages the definitions.
 *
 * Routes span two base paths (category-scoped list/create + id-scoped
 * mutations), so the controller declares full paths per method rather than a
 * shared prefix.
 */
@ApiTags('Attribute Definitions')
@ApiExtraModels(
  AttributeDefinitionEntity,
  AttributeDefinitionResponse,
  AttributeDefinitionListResponse,
  AttributeDefinitionDeleteResponse,
)
@Controller()
@UseGuards(PermissionGuard)
@RequirePermission('attributes:write')
@ApiBearerAuth('access-token')
export class AttributeDefinitionController {
  constructor(private readonly service: AttributeDefinitionService) {}

  /** GET /api/categories/:categoryId/attribute-definitions — own-category templates. */
  @Get('categories/:categoryId/attribute-definitions')
  @ApiOperation({
    summary: "List a category's own characteristic templates (admin)",
    operationId: 'attributeDefinitionControllerFindByCategory',
  })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiResponse({ status: 200, type: AttributeDefinitionListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findByCategory(
    @Param('categoryId') categoryId: string,
  ): Promise<AttributeDefinitionListResponse> {
    return { data: await this.service.findByCategory(categoryId) };
  }

  /**
   * GET /api/categories/:categoryId/effective-attribute-definitions
   *
   * The EFFECTIVE templates for a category (own + inherited from ancestors),
   * for the admin product-specs editor which renders one typed input per
   * effective definition. Admin-only.
   */
  @Get('categories/:categoryId/effective-attribute-definitions')
  @ApiOperation({
    summary: "List a category's effective (own + inherited) templates (admin)",
    operationId: 'attributeDefinitionControllerFindEffective',
  })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiResponse({ status: 200, type: AttributeDefinitionListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findEffective(
    @Param('categoryId') categoryId: string,
  ): Promise<AttributeDefinitionListResponse> {
    return { data: await this.service.findEffectiveForCategory(categoryId) };
  }

  /** POST /api/categories/:categoryId/attribute-definitions — create a template. */
  @Post('categories/:categoryId/attribute-definitions')
  @ApiOperation({
    summary: 'Create a characteristic template on a category (admin)',
    operationId: 'attributeDefinitionControllerCreate',
  })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiResponse({ status: 201, type: AttributeDefinitionResponse })
  @ApiResponse({ status: 400, description: 'Invalid input (e.g. SELECT without options)' })
  @ApiResponse({ status: 409, description: 'Duplicate key for this category' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(
    @Param('categoryId') categoryId: string,
    @Body() dto: CreateAttributeDefinitionDto,
  ): Promise<AttributeDefinitionResponse> {
    return { data: await this.service.create(categoryId, dto) };
  }

  /**
   * PATCH /api/categories/:categoryId/attribute-definitions/reorder (TASK-298)
   *
   * Rewrites the COMPLETE ordering of ONE category's templates — the array index becomes
   * `sortOrder` — in one advisory-locked transaction, and returns the refreshed list.
   *
   * `orderedIds` must name EVERY template of the category: a partial payload means another
   * admin added one since the client loaded the list, and is rejected with a 409.
   */
  @Patch('categories/:categoryId/attribute-definitions/reorder')
  @ApiOperation({
    summary: "Reorder a category's characteristic templates (admin)",
    operationId: 'attributeDefinitionControllerReorder',
  })
  @ApiParam({ name: 'categoryId', description: 'Category UUID' })
  @ApiResponse({ status: 200, type: AttributeDefinitionListResponse })
  @ApiResponse({ status: 400, description: 'Validation error or REORDER_DUPLICATE_ID' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({
    status: 404,
    description: 'Category not found, or REORDER_NOT_FOUND — an id is not in this category',
  })
  @ApiResponse({
    status: 409,
    description: 'REORDER_STALE — another admin added a template to this category first',
  })
  async reorder(
    @Param('categoryId') categoryId: string,
    @Body() dto: ReorderAttributeDefinitionsDto,
  ): Promise<AttributeDefinitionListResponse> {
    return { data: await this.service.reorder(categoryId, dto) };
  }

  /** PATCH /api/attribute-definitions/:id — update a template. */
  @Patch('attribute-definitions/:id')
  @ApiOperation({
    summary: 'Update a characteristic template (admin)',
    operationId: 'attributeDefinitionControllerUpdate',
  })
  @ApiParam({ name: 'id', description: 'Definition UUID' })
  @ApiResponse({ status: 200, type: AttributeDefinitionResponse })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Characteristic not found' })
  @ApiResponse({ status: 409, description: 'Duplicate key for this category' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAttributeDefinitionDto,
  ): Promise<AttributeDefinitionResponse> {
    return { data: await this.service.update(id, dto) };
  }

  /** DELETE /api/attribute-definitions/:id — delete a template. */
  @Delete('attribute-definitions/:id')
  @ApiOperation({
    summary: 'Delete a characteristic template (admin)',
    operationId: 'attributeDefinitionControllerDelete',
  })
  @ApiParam({ name: 'id', description: 'Definition UUID' })
  @ApiResponse({ status: 200, type: AttributeDefinitionDeleteResponse })
  @ApiResponse({ status: 404, description: 'Characteristic not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async remove(@Param('id') id: string): Promise<AttributeDefinitionDeleteResponse> {
    return { data: await this.service.delete(id) };
  }
}
