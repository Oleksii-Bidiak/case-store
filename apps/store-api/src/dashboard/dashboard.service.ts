import { Injectable } from '@nestjs/common';
import { PermissionService, type PermissionActor } from '../auth/permissions';
import { DashboardRepository } from './dashboard.repository';
import { DashboardSummaryResponse, NeedsActionDto } from './dto';
import type { TopProduct } from './dashboard.types';

/**
 * The admin dashboard's service — and the place where its money is cut out
 * (TASK-684, plan 188).
 *
 * All computation lives in {@link DashboardRepository}. What lives here is the
 * one decision the repository must not make: whether the CALLER may see revenue.
 * `analytics:read` opens the dashboard; `analytics:revenue` adds the sums. The
 * admin panel is a public bundle and the network tab shows whatever the API
 * sent, so "no" has to be enforced on the response object itself — which is
 * why it is a service rule and not a component's `if`.
 *
 * Also the seam where caching (Redis, TASK-044 / TASK-685) can later be added
 * without changing the controller — and any such cache must key on the same
 * permission, or the money is served from cache to whoever asks next.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly dashboardRepository: DashboardRepository,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Assemble the dashboard summary for `actor`.
   *
   * With `analytics:revenue` (an owner or admin holds it by level): the revenue
   * block, and top products with their sums, ranked by revenue.
   *
   * Without it, three things, each closing a different leak:
   *   - the revenue metrics are never COMPUTED — not computed and then dropped;
   *   - the `revenue` key is OMITTED, not sent as null or zeros (a zero is a
   *     false statement about the shop, and a null still announces the field);
   *   - top products lose `totalRevenue` and are selected and ranked by units
   *     sold. A list ordered by money, with every sum removed, still tells its
   *     reader which product earns the most.
   */
  async getSummary(actor: PermissionActor): Promise<DashboardSummaryResponse> {
    if (this.permissionService.actorHasPermission(actor, 'analytics:revenue')) {
      const [summary, revenue] = await Promise.all([
        this.dashboardRepository.getSummary({ topProductsRankedBy: 'revenue' }),
        this.dashboardRepository.getRevenueMetrics(),
      ]);
      return { revenue, ...summary };
    }

    const summary = await this.dashboardRepository.getSummary({ topProductsRankedBy: 'units' });
    return {
      ...summary,
      products: {
        ...summary.products,
        topProducts: withoutMoney(summary.products.topProducts),
      },
    };
  }

  /**
   * "Needs action" counters for the dashboard widget + sidebar badges
   * (TASK-248). Thin pass-through — the repository returns an object structurally
   * identical to {@link NeedsActionDto}; the controller wraps it in `{ data }`.
   * Counts only, no money: it stays under `analytics:read` alone.
   */
  async getNeedsAction(): Promise<NeedsActionDto> {
    return this.dashboardRepository.getNeedsAction();
  }
}

/**
 * Top products as a caller without `analytics:revenue` may see them: no
 * `totalRevenue` key at all, ordered by units sold with the product id as the
 * tie-break. The repository already ranks this way when asked for `units`; the
 * sort is repeated here so the response is right even if the rows arrive in
 * revenue order — the order is part of what is being withheld.
 */
function withoutMoney(products: readonly TopProduct[]): TopProduct[] {
  return products
    .map(({ productId, name, unitsSold }) => ({ productId, name, unitsSold }))
    .sort((a, b) => b.unitsSold - a.unitsSold || compareIds(a.productId, b.productId));
}

/** Plain code-unit order: deterministic, and independent of the server's locale. */
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
