import { Controller, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { SiteContactService } from './site-contact.service';
import { UpdateSiteContactDto } from './dto';
import { AdminGuard } from '../auth/guards';
import { SiteContactSettingsEntity } from './entities';
import { SiteContactResponseEnvelope } from './site-contact.controller';

/**
 * Admin controller for managing the singleton site-contact settings.
 *
 *   PUT /api/admin/site-contact — upsert the contact block (ADMIN role required)
 */
@ApiTags('SiteContact')
@ApiExtraModels(SiteContactSettingsEntity, SiteContactResponseEnvelope)
@Controller('admin/site-contact')
@UseGuards(AdminGuard)
export class AdminSiteContactController {
  constructor(private readonly service: SiteContactService) {}

  /**
   * PUT /api/admin/site-contact
   *
   * Upserts the singleton contact row with the provided fields. All fields are
   * optional — send only the fields you want to change. Admin-only.
   */
  @Put()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update site contact settings (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Site contact settings updated',
    type: SiteContactResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(@Body() dto: UpdateSiteContactDto): Promise<SiteContactResponseEnvelope> {
    const data = await this.service.updateSettings(dto);

    return { data };
  }
}
