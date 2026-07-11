import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SlugRedirectService } from './slug-redirect.service';
import { SlugRedirectLookupQueryDto } from './dto';
import { SlugRedirectLookupEntity } from './entities';

/**
 * Response envelope for a successful slug-redirect lookup.
 */
export class SlugRedirectLookupResponse {
  @ApiProperty({
    type: SlugRedirectLookupEntity,
    description: 'The redirect target for the requested dead slug',
  })
  data!: SlugRedirectLookupEntity;
}

/**
 * Public slug-redirect lookup (no auth required) — TASK-285-D.
 *
 *   GET /api/slug-redirect?entity=PAGE&slug=old-slug
 *
 * Consulted by the storefront's dynamic routes right before rendering a 404:
 * a hit means the address was renamed by an admin and the visitor should be
 * permanently redirected to the current slug.
 */
@ApiTags('Slug Redirect')
@ApiExtraModels(SlugRedirectLookupEntity, SlugRedirectLookupResponse)
@Controller('slug-redirect')
export class SlugRedirectController {
  constructor(private readonly slugRedirectService: SlugRedirectService) {}

  /**
   * GET /api/slug-redirect
   *
   * Returns the current live slug a dead slug permanently redirects to.
   * 404 when the slug has no redirect row (never renamed, or currently live).
   * Public — no authentication.
   */
  @Get()
  @ApiOperation({ summary: 'Resolve a renamed (dead) slug to its current live slug' })
  @ApiResponse({
    status: 200,
    description: 'Redirect target found',
    type: SlugRedirectLookupResponse,
  })
  @ApiResponse({ status: 400, description: 'Invalid entity value' })
  @ApiResponse({ status: 404, description: 'No redirect recorded for this slug' })
  async lookup(@Query() query: SlugRedirectLookupQueryDto): Promise<SlugRedirectLookupResponse> {
    const result = await this.slugRedirectService.lookup(query.entity, query.slug);
    if (!result) {
      throw new NotFoundException(`No redirect recorded for ${query.entity} slug "${query.slug}"`);
    }
    return { data: result };
  }
}
