import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiExtraModels } from '@nestjs/swagger';
import { SiteContactService } from './site-contact.service';
import { SiteContactSettingsEntity } from './entities';

/**
 * Response envelope for the site-contact settings.
 *
 * Decorated class (not a bare interface) so Swagger emits a `{ data }` schema
 * and Orval generates a typed client hook.
 */
export class SiteContactResponseEnvelope {
  @ApiProperty({ type: SiteContactSettingsEntity })
  data!: SiteContactSettingsEntity;
}

/**
 * Public controller exposing the admin-managed contact block.
 *
 *   GET /api/site-contact — contact info for the storefront footer / contacts page
 */
@ApiTags('SiteContact')
@ApiExtraModels(SiteContactSettingsEntity, SiteContactResponseEnvelope)
@Controller('site-contact')
export class SiteContactController {
  constructor(private readonly service: SiteContactService) {}

  /**
   * GET /api/site-contact
   *
   * Returns the contact block. Always returns `{ data }` — all optional fields
   * are null if the row has not been seeded yet. No authentication required.
   */
  @Get()
  @ApiOperation({ summary: 'Get site contact settings' })
  @ApiResponse({
    status: 200,
    description: 'Site contact settings',
    type: SiteContactResponseEnvelope,
  })
  async getSettings(): Promise<SiteContactResponseEnvelope> {
    const data = await this.service.getSettings();

    return { data };
  }
}
