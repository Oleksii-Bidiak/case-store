import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { SeoSettingsService } from './seo-settings.service';
import { StoreLogoService } from './store-logo.service';
import { UpdateSeoSettingsDto, SeoHealthResponseEnvelope } from './dto';
import { ALLOWED_LOGO_MIME, LOGO_MULTER_MAX_BYTES } from './store-logo.constants';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { SeoSettingsEntity, SeoHealthEntity } from './entities';
import { SeoSettingsResponseEnvelope } from './seo-settings.controller';

/**
 * Multer options for the logo upload. The file is buffered in memory (no temp
 * files) so nothing untrusted ever touches the disk before it has been sanitized
 * / re-encoded. This `fileFilter` is the first of two MIME gates; StoreLogoService
 * re-checks the type and enforces the stricter 1 MB business limit (→ 413).
 */
const logoMulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: LOGO_MULTER_MAX_BYTES, files: 1 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string },
    cb: (error: Error | null, acceptFile: boolean) => void,
  ): void => {
    if (ALLOWED_LOGO_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
    }
  },
};

/**
 * Admin controller for managing the singleton SEO settings.
 *
 *   PUT    /api/admin/seo-settings         — upsert the SEO settings (ADMIN)
 *   GET    /api/admin/seo-settings/health  — SEO-health checklist counts (ADMIN)
 *   POST   /api/admin/seo-settings/logo    — upload the store logo (ADMIN)
 *   DELETE /api/admin/seo-settings/logo    — remove the store logo (ADMIN)
 */
@ApiTags('SeoSettings')
@ApiExtraModels(
  SeoSettingsEntity,
  SeoSettingsResponseEnvelope,
  SeoHealthEntity,
  SeoHealthResponseEnvelope,
)
@Controller('admin/seo-settings')
@UseGuards(PermissionGuard)
@RequirePermission('settings:seo')
export class AdminSeoSettingsController {
  constructor(
    private readonly service: SeoSettingsService,
    private readonly logoService: StoreLogoService,
  ) {}

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

  /**
   * GET /api/admin/seo-settings/health
   *
   * Returns the six catalog COUNTs (products / categories / pages: how many live
   * rows lack their own metaTitle, and how many are live in total) powering the
   * «SEO-здоров'я» checklist on /settings/seo. Admin-only. (TASK-269)
   */
  @Get('health')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get SEO health checklist (admin)',
    operationId: 'adminSeoSettingsControllerGetHealth',
  })
  @ApiResponse({
    status: 200,
    description: 'SEO-health catalog counts',
    type: SeoHealthResponseEnvelope,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async getHealth(): Promise<SeoHealthResponseEnvelope> {
    const data = await this.service.getHealth();

    return { data };
  }

  /**
   * POST /api/admin/seo-settings/logo
   *
   * Uploads the store logo (multipart/form-data, single field `file`). Accepts
   * SVG + PNG/WebP/JPEG up to 1 MB; SVG is sanitized and raster is re-encoded
   * before it is stored. Writes `logoUrl` on the singleton and returns the updated
   * settings. Admin-only. (TASK-299)
   */
  @Post('logo')
  @UseInterceptors(FileInterceptor('file', logoMulterOptions))
  @ApiBearerAuth('access-token')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload the store logo (admin)',
    operationId: 'adminSeoSettingsControllerUploadLogo',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Logo uploaded', type: SeoSettingsResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Missing file, or unsafe/unrenderable SVG' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  @ApiResponse({ status: 413, description: 'File exceeds the 1 MB limit' })
  @ApiResponse({ status: 415, description: 'Unsupported file type' })
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SeoSettingsResponseEnvelope> {
    const data = await this.logoService.uploadLogo(file);

    return { data };
  }

  /**
   * DELETE /api/admin/seo-settings/logo
   *
   * Clears `logoUrl` and removes the stored file from disk. Returns the updated
   * settings so the caller does not need a follow-up read. Admin-only. (TASK-299)
   */
  @Delete('logo')
  @HttpCode(200)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Remove the store logo (admin)',
    operationId: 'adminSeoSettingsControllerDeleteLogo',
  })
  @ApiResponse({ status: 200, description: 'Logo removed', type: SeoSettingsResponseEnvelope })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async deleteLogo(): Promise<SeoSettingsResponseEnvelope> {
    const data = await this.logoService.deleteLogo();

    return { data };
  }
}
