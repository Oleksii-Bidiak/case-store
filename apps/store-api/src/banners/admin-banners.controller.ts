import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiExtraModels,
} from '@nestjs/swagger';
import { BannerService } from './banners.service';
import { CreateBannerDto, UpdateBannerDto, AdminBannerListQueryDto } from './dto';
import { AdminGuard } from '../auth/guards';
import { BannerEntity } from './entities';

/**
 * Response envelope for an admin banner list (published + drafts).
 */
class AdminBannerListResponse {
  @ApiProperty({ type: [BannerEntity], description: 'Banners (all statuses, optionally filtered)' })
  data!: BannerEntity[];
}

/**
 * Response envelope for a single banner.
 */
class BannerResponseEnvelope {
  @ApiProperty({ type: BannerEntity })
  data!: BannerEntity;
}

/**
 * Controller for admin banner management (ADMIN role required).
 *
 *   GET    /api/admin/banners              — list all banners (all statuses)
 *   GET    /api/admin/banners/:id          — banner by ID
 *   POST   /api/admin/banners              — create
 *   PUT    /api/admin/banners/:id          — full update
 *   PATCH  /api/admin/banners/:id/publish  — set status = PUBLISHED
 *   PATCH  /api/admin/banners/:id/unpublish— set status = DRAFT
 *   DELETE /api/admin/banners/:id          — hard delete
 */
@ApiTags('Banners')
@ApiExtraModels(AdminBannerListResponse, BannerEntity, BannerResponseEnvelope)
@Controller('admin/banners')
@UseGuards(AdminGuard)
export class AdminBannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List all banners — all statuses (admin)' })
  @ApiResponse({ status: 200, description: 'List of banners', type: AdminBannerListResponse })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: AdminBannerListQueryDto): Promise<AdminBannerListResponse> {
    return this.bannerService.findAllAdmin(query);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a banner by ID (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner found', type: BannerResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findById(@Param('id') id: string): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.findByIdAdmin(id);

    return { data: banner };
  }

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a banner (admin)' })
  @ApiResponse({ status: 201, description: 'Banner created', type: BannerResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async create(@Body() dto: CreateBannerDto): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.create(dto);

    return { data: banner };
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner updated', type: BannerResponseEnvelope })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
  ): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.update(id, dto);

    return { data: banner };
  }

  @Patch(':id/publish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Publish a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner published', type: BannerResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async publish(@Param('id') id: string): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.publish(id);

    return { data: banner };
  }

  @Patch(':id/unpublish')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Unpublish a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 200, description: 'Banner unpublished', type: BannerResponseEnvelope })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async unpublish(@Param('id') id: string): Promise<BannerResponseEnvelope> {
    const banner = await this.bannerService.unpublish(id);

    return { data: banner };
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a banner (admin)' })
  @ApiParam({ name: 'id', description: 'Banner UUID' })
  @ApiResponse({ status: 204, description: 'Banner deleted' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.bannerService.delete(id);
  }
}
