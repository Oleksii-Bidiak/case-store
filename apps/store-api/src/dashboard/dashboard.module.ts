import { Module } from '@nestjs/common';
import { ReportsModule } from '../analytics/reports/reports.module';
import { PrismaModule } from '../prisma';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

/**
 * Admin dashboard. Imports the `/analytics` {@link ReportsModule} for its
 * shared queries (plan 188): the dashboard's top products and revenue are the
 * reports' formulas over the dashboard's window, not a second formula.
 */
@Module({
  imports: [PrismaModule, ReportsModule],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
