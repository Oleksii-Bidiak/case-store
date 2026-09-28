import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission } from '../auth/permissions';
import { FunnelReportEntity } from './entities/funnel-report.entity';
import { FunnelReportService } from './funnel-report.service';
import { PeriodQueryDto } from './reports/dto/period-query.dto';

class FunnelReportEnvelope {
  @ApiProperty({ type: FunnelReportEntity })
  data!: FunnelReportEntity;
}

/**
 * «Відвідуваність і воронка» (TASK-689) at the reports' address,
 * `GET /api/admin/analytics/reports/funnel`, and under the reports' tag — but
 * declared here, in the Umami module, so the funnel shares the traffic card's
 * client (one login, one token) instead of the reports module growing a second.
 */
@ApiTags('Admin Analytics Reports')
@ApiBearerAuth('access-token')
@UseGuards(PermissionGuard)
@Controller('admin/analytics/reports')
export class FunnelReportController {
  constructor(private readonly funnelReportService: FunnelReportService) {}

  @Get('funnel')
  @RequirePermission('analytics:read')
  @ApiOperation({
    summary:
      'Add to cart → begin checkout → purchase, from Umami, compared with the previous range',
    description:
      'Event counts (not visitors) of the three storefront events, step-to-step shares and the ' +
      'overall conversion purchase ÷ add_to_cart. `configured` / `available` distinguish "not ' +
      'set up" and "did not answer" from real zeros; in those states every number is null. ' +
      'Nothing is taken from our own orders.',
    operationId: 'getFunnelReport',
  })
  @ApiResponse({ status: 200, description: 'Funnel report', type: FunnelReportEnvelope })
  @ApiResponse({ status: 400, description: 'The period cannot be answered' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Forbidden — analytics:read required' })
  async getFunnel(@Query() query: PeriodQueryDto): Promise<{ data: FunnelReportEntity }> {
    return { data: await this.funnelReportService.getFunnelReport(query) };
  }
}
