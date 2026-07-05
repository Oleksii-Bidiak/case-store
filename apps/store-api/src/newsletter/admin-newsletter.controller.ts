import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { NewsletterService } from './newsletter.service';
import { NewsletterExportQueryDto, NewsletterListQueryDto } from './dto';
import { NewsletterSubscriptionEntity } from './entities';
import { AdminGuard } from '../auth/guards';

/**
 * Pagination metadata for paginated admin subscriber lists.
 */
class SubscriptionPaginationMeta {
  @ApiProperty({ description: 'Total number of items', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Current page (1-based)', example: 1 })
  page!: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages!: number;
}

/**
 * Response envelope for a paginated admin subscriber list.
 */
class SubscriptionListResponse {
  @ApiProperty({ type: [NewsletterSubscriptionEntity], description: 'Subscribers for the page' })
  data!: NewsletterSubscriptionEntity[];

  @ApiProperty({ type: SubscriptionPaginationMeta })
  meta!: SubscriptionPaginationMeta;
}

/**
 * Admin newsletter management (ADMIN role required).
 *
 *   GET /api/newsletter/admin         — paginated subscriber list (filter + search)
 *   GET /api/newsletter/admin/export  — CSV download of matching subscribers
 */
@ApiTags('Newsletter')
@ApiExtraModels(NewsletterSubscriptionEntity, SubscriptionPaginationMeta, SubscriptionListResponse)
@Controller('newsletter/admin')
@UseGuards(AdminGuard)
export class AdminNewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List newsletter subscribers (admin)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated subscriber list',
    type: SubscriptionListResponse,
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async findAll(@Query() query: NewsletterListQueryDto): Promise<SubscriptionListResponse> {
    return this.newsletterService.findAll(query);
  }

  @Get('export')
  @ApiBearerAuth('access-token')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export newsletter subscribers as CSV (admin)' })
  @ApiResponse({
    status: 200,
    description: 'CSV file of subscribers (email,status,source,createdAt)',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  @ApiResponse({ status: 403, description: 'Forbidden — admin access required' })
  async export(@Query() query: NewsletterExportQueryDto, @Res() response: Response): Promise<void> {
    const csv = await this.newsletterService.exportCsv(query);

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="newsletter-subscribers.csv"');
    response.send(csv);
  }
}
