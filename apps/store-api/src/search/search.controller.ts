import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExtraModels, ApiProperty } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SearchService, type SearchResults } from './search.service';
import { SearchQueryDto, SuggestQueryDto } from './dto';
import { SearchSuggestionEntity } from './entities';
import { PublicProductEntity } from '../product/entities';

/** Pagination metadata for a search result page. */
class SearchMetaDto {
  @ApiProperty({ description: 'Total matching products', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages!: number;
}

/** Response envelope for `GET /api/search`. */
class SearchResultsResponse {
  @ApiProperty({ type: [PublicProductEntity], description: 'Matching products for the page' })
  data!: PublicProductEntity[];

  @ApiProperty({ type: SearchMetaDto })
  meta!: SearchMetaDto;
}

/** Response envelope for `GET /api/search/suggest`. */
class SearchSuggestResponse {
  @ApiProperty({ type: [SearchSuggestionEntity], description: 'Autocomplete suggestions' })
  data!: SearchSuggestionEntity[];
}

/**
 * Public product search (TASK-075).
 *
 *   GET /api/search?q=айфон          — paginated, typo-tolerant results grid
 *   GET /api/search/suggest?q=айф     — header autocomplete suggestions
 *
 * Both are Meilisearch-backed with a transparent Postgres fallback (see
 * {@link SearchService}) so they never 500 when the engine is down/unconfigured.
 * Throttled because `suggest` is hit per keystroke (the frontend also debounces).
 */
@ApiTags('Search')
@ApiExtraModels(
  PublicProductEntity,
  SearchSuggestionEntity,
  SearchMetaDto,
  SearchResultsResponse,
  SearchSuggestResponse,
)
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Search products (paginated, typo-tolerant)', operationId: 'search' })
  @ApiResponse({ status: 200, description: 'Matching products', type: SearchResultsResponse })
  async search(@Query() query: SearchQueryDto): Promise<SearchResults> {
    return this.searchService.search(query.q ?? '', query.page ?? 1, query.limit ?? 20);
  }

  @Get('suggest')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Autocomplete product suggestions', operationId: 'searchSuggest' })
  @ApiResponse({ status: 200, description: 'Suggestions', type: SearchSuggestResponse })
  async suggest(@Query() query: SuggestQueryDto): Promise<{ data: SearchSuggestionEntity[] }> {
    return { data: await this.searchService.suggest(query.q) };
  }
}
