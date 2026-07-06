import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { SeoSettingsService } from './seo-settings.service';
import { SeoSettingsEntity } from './entities';

/**
 * Response envelope for the SEO settings.
 *
 * Decorated class (not a bare interface) so Swagger emits a `{ data }` schema
 * and Orval generates a typed client hook.
 */
export class SeoSettingsResponseEnvelope {
  @ApiProperty({ type: SeoSettingsEntity })
  data!: SeoSettingsEntity;
}

/**
 * Public controller exposing the admin-managed SEO settings.
 *
 *   GET /api/seo-settings — global SEO defaults for the storefront (root
 *   metadata, robots.ts, llms.txt, Organization `sameAs`).
 */
@ApiTags('SeoSettings')
@ApiExtraModels(SeoSettingsEntity, SeoSettingsResponseEnvelope)
@Controller('seo-settings')
export class SeoSettingsController {
  constructor(private readonly service: SeoSettingsService) {}

  /**
   * GET /api/seo-settings
   *
   * Returns the SEO settings. Always returns `{ data }` — zero-config defaults
   * (all optional fields null, noindexSite false, additionalSameAsLinks []) when
   * the row has not been seeded yet. No authentication required.
   */
  @Get()
  @ApiOperation({ summary: 'Get SEO settings' })
  @ApiResponse({
    status: 200,
    description: 'SEO settings',
    type: SeoSettingsResponseEnvelope,
  })
  async getSettings(): Promise<SeoSettingsResponseEnvelope> {
    const data = await this.service.getSettings();

    return { data };
  }
}
