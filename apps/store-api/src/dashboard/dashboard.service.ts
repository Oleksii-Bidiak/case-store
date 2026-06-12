import { Injectable } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';
import { DashboardSummaryResponse } from './dto';

/**
 * Thin pass-through service for the admin dashboard.
 *
 * All computation lives in {@link DashboardRepository}. The service exists to
 * honour the Clean Architecture boundary (controllers never touch repositories
 * directly) and to provide the seam where caching middleware (Phase 5 / Redis,
 * TASK-044) can later be added without changing the controller.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  /**
   * Assemble the full dashboard summary. The repository returns an object that
   * is structurally identical to {@link DashboardSummaryResponse}.
   */
  async getSummary(): Promise<DashboardSummaryResponse> {
    return this.dashboardRepository.getSummary();
  }
}
