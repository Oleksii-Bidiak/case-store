import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { SearchSynonymsService } from './search-synonyms.service';
import { UpdateSearchSynonymsDto } from './dto';
import {
  SearchSynonymsEntity,
  SearchSynonymsResponseEnvelope,
  SearchSynonymsSaveResponseEnvelope,
  SearchSynonymsSaveResultEntity,
} from './entities';

/**
 * Admin editing of the search synonyms (TASK-559).
 *
 *   GET /api/admin/search/synonyms — the list search uses now (the built-in
 *                                    dictionary while none is saved)
 *   PUT /api/admin/search/synonyms — replace the whole list and push it to the
 *                                    search engine
 *
 * Gated by `settings:search`, the same right as the reindex button on the same
 * screen: both change what the shop's search answers.
 */
@ApiTags('Search')
@ApiExtraModels(SearchSynonymsEntity, SearchSynonymsSaveResultEntity)
@Controller('admin/search/synonyms')
@UseGuards(PermissionGuard)
@RequirePermission('settings:search')
export class AdminSearchSynonymsController {
  constructor(private readonly service: SearchSynonymsService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the search synonym list (admin)',
    operationId: 'adminGetSearchSynonyms',
  })
  @ApiResponse({ status: 200, description: 'Synonym list', type: SearchSynonymsResponseEnvelope })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:search required' })
  async find(): Promise<SearchSynonymsResponseEnvelope> {
    return { data: await this.service.getSettings() };
  }

  @Put()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Replace the search synonym list (admin)',
    description:
      'Replaces the whole list. An empty `groups` array restores the built-in dictionary. The engine is updated best-effort — see `appliedToSearch`.',
    operationId: 'adminUpdateSearchSynonyms',
  })
  @ApiResponse({
    status: 200,
    description: 'Saved',
    type: SearchSynonymsSaveResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid synonym list' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — settings:search required' })
  async update(@Body() dto: UpdateSearchSynonymsDto): Promise<SearchSynonymsSaveResponseEnvelope> {
    const data = await this.service.replace(dto.groups.map((group) => group.terms));
    return { data };
  }
}
