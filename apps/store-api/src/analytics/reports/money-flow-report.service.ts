import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionService, type PermissionActor } from '../../auth/permissions';
import type { Paginated } from '../../common/pagination';
import {
  DEFAULT_MONEY_FLOW_ENTRIES_LIMIT,
  MoneyFlowEntriesQueryDto,
} from './dto/money-flow-entries-query.dto';
import { PeriodQueryDto } from './dto/period-query.dto';
import { MoneyFlowEntryEntity } from './entities/money-flow-entry.entity';
import { MoneyFlowReportEntity } from './entities/money-flow-report.entity';
import { MoneyFlowRepository } from './money-flow.repository';
import { resolveReportPeriod } from './report-period';

/** Both are needed: it is analytics money AND it lists individual payments. */
const REQUIRED_PERMISSIONS = ['analytics:revenue', 'payments:read'] as const;

/**
 * «Рух коштів» (TASK-2395) — the order money ledger as a report and a register.
 *
 * Not cached (owner decision): an accountant who has just recorded a payment
 * must see it on the next load, and the queries are index range scans over
 * `occurred_at`.
 */
@Injectable()
export class MoneyFlowReportService {
  constructor(
    private readonly moneyFlowRepository: MoneyFlowRepository,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * @throws ForbiddenException without `analytics:revenue` and `payments:read` —
   *   checked first, so a refused caller learns nothing about the period.
   */
  async getMoneyFlowReport(
    query: PeriodQueryDto,
    actor: PermissionActor,
    now: Date = new Date(),
  ): Promise<MoneyFlowReportEntity> {
    this.assertCanRead(actor);
    const period = resolveReportPeriod(query, now);

    const [current, previous, balances] = await Promise.all([
      this.moneyFlowRepository.getByKind(period.current),
      this.moneyFlowRepository.getByKind(period.previous),
      this.moneyFlowRepository.getBalances(),
    ]);
    return MoneyFlowReportEntity.from(period, current, previous, balances);
  }

  /** The register of the chosen period (the comparison range is not listed). */
  async getMoneyFlowEntries(
    query: MoneyFlowEntriesQueryDto,
    actor: PermissionActor,
    now: Date = new Date(),
  ): Promise<Paginated<MoneyFlowEntryEntity>> {
    this.assertCanRead(actor);
    const period = resolveReportPeriod(query, now);
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_MONEY_FLOW_ENTRIES_LIMIT;

    const { rows, total } = await this.moneyFlowRepository.findEntries(period.current, {
      kind: query.kind,
      page,
      limit,
    });
    return {
      items: rows.map((row) => MoneyFlowEntryEntity.from(row)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private assertCanRead(actor: PermissionActor): void {
    for (const permission of REQUIRED_PERMISSIONS) {
      if (!this.permissionService.actorHasPermission(actor, permission)) {
        throw new ForbiddenException(`${permission} is required for the money flow report`);
      }
    }
  }
}
