import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { TrafficSummaryEntity } from './entities/traffic-summary.entity';
import { TrafficQueryDto, DEFAULT_TRAFFIC_DAYS } from './dto/traffic-query.dto';
import { PermissionGuard, RequirePermission } from '../auth/permissions';

class TrafficSummaryEnvelope {
  @ApiProperty({ type: TrafficSummaryEntity })
  data!: TrafficSummaryEntity;
}

/**
 * Storefront traffic for the admin dashboard (TASK-380).
 *
 *   GET /api/admin/analytics/traffic?days=7
 *
 * Gated by the existing `analytics:read` permission — the same one behind the
 * dashboard's revenue and needs-action tiles, since this is the same zone and a
 * separate permission would only add a checkbox nobody understands.
 *
 * The endpoint exists so the analytics credential stays server-side: the admin
 * panel is a browser bundle, and anything it holds is public.
 */
@ApiTags('Analytics')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('traffic')
  @UseGuards(PermissionGuard)
  @RequirePermission('analytics:read')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Storefront traffic summary (admin)',
    operationId: 'getTrafficSummary',
  })
  @ApiResponse({ status: 200, description: 'Traffic summary', type: TrafficSummaryEnvelope })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — analytics access required' })
  async getTraffic(@Query() query: TrafficQueryDto): Promise<{ data: TrafficSummaryEntity }> {
    const data = await this.analyticsService.getTrafficSummary(query.days ?? DEFAULT_TRAFFIC_DAYS);
    return { data };
  }
}
