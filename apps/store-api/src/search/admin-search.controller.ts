import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { BlogSearchService } from './blog-search.service';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

/** Response envelope for `POST /api/admin/search/reindex`. */
class ReindexResponse {
  @ApiProperty({ description: 'Number of products re-indexed', example: 128 })
  indexed!: number;

  @ApiProperty({ description: 'Number of published blog posts re-indexed', example: 12 })
  blogPosts!: number;
}

class ReindexResponseEnvelope {
  @ApiProperty({ type: ReindexResponse })
  data!: ReindexResponse;
}

/**
 * Admin search maintenance (TASK-075).
 *
 *   POST /api/admin/search/reindex — rebuild the products AND blog indexes from
 *   Postgres (the blog since TASK-525; before that its index drifted until the
 *   next restart, with no repair action at all).
 *
 * Gated by `settings:search`. Used for drift recovery / after a bulk import; the
 * indexes are also kept in step incrementally by mutations and a bootstrap
 * reindex.
 */
@ApiTags('Search')
@Controller('admin/search')
export class AdminSearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly blogSearchService: BlogSearchService,
  ) {}

  @Post('reindex')
  @UseGuards(PermissionGuard)
  @RequirePermission('settings:search')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Rebuild the product and blog search indexes (admin)',
    operationId: 'reindexSearch',
  })
  @ApiResponse({ status: 200, description: 'Reindex complete', type: ReindexResponseEnvelope })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async reindex(): Promise<{ data: ReindexResponse }> {
    // Sequential on purpose, as in `npm run search:reindex`: two full passes at
    // once would only compete for the same small engine.
    const indexed = await this.searchService.reindexAll();
    const blogPosts = await this.blogSearchService.reindexAll();
    return { data: { indexed, blogPosts } };
  }
}
