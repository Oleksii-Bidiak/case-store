import { Controller, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiExtraModels } from '@nestjs/swagger';
import { SeoSettingsService } from './seo-settings.service';
import { UpdateSeoSettingsDto } from './dto';
import { AdminGuard } from '../auth/guards';
import { SeoSettingsEntity } from './entities';
import { SeoSettingsResponseEnvelope } from './seo-settings.controller';

/**
 * Admin controller for managing the singleton SEO settings.
 *
 *   PUT /api/admin/seo-settings — upsert the SEO settings (ADMIN role required)
 */
@ApiTags('SeoSettings')
@ApiExtraModels(SeoSettingsEntity, SeoSettingsResponseEnvelope)
@Controller('admin/seo-settings')
@UseGuards(AdminGuard)
export class AdminSeoSettingsController {
  constructor(private readonly service: SeoSettingsService) {}

  /**
   * PUT /api/admin/seo-settings
   *
   * Upserts the singleton SEO-settings row with the provided fields, then
   * triggers a storefront revalidation. All fields are optional — send only the
   * fields you want to change. Admin-only.
   */
  @Put()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update SEO settings (admin)' })
  @ApiResponse({
    status: 200,
    description: 'SEO settings updated',
    type: SeoSettingsResponseEnvelope,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(@Body() dto: UpdateSeoSettingsDto): Promise<SeoSettingsResponseEnvelope> {
    const data = await this.service.updateSettings(dto);

    return { data };
  }
}
