import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/** Response envelope for `POST /api/admin/search/reindex`. */
class ReindexResponse {
  @ApiProperty({ description: 'Number of products re-indexed', example: 128 })
  indexed!: number;
}

class ReindexResponseEnvelope {
  @ApiProperty({ type: ReindexResponse })
  data!: ReindexResponse;
}

/**
 * Admin search maintenance (TASK-075).
 *
 *   POST /api/admin/search/reindex — rebuild the products index from Postgres.
 *
 * ADMIN-only. Used for drift recovery / after a bulk import; the index is also
 * kept in step incrementally by product mutations and a bootstrap reindex.
 */
@ApiTags('Search')
@Controller('admin/search')
export class AdminSearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('reindex')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings:search')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Rebuild the product search index (admin)',
    operationId: 'reindexSearch',
  })
  @ApiResponse({ status: 200, description: 'Reindex complete', type: ReindexResponseEnvelope })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async reindex(): Promise<{ data: ReindexResponse }> {
    const indexed = await this.searchService.reindexAll();
    return { data: { indexed } };
  }
}
