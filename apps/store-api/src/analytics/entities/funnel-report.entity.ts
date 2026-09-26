import { ApiProperty } from '@nestjs/swagger';
import { ComparedValueEntity, ReportPeriodEntity } from '../reports/entities/report-common.entity';

/**
 * The three storefront events the funnel is built from, in order. The
 * storefront already sends exactly these (`store-client/src/shared/lib/analytics.ts`);
 * renaming one there silently empties a step here, so the list is the contract.
 */
export const FUNNEL_EVENTS = ['add_to_cart', 'begin_checkout', 'purchase'] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

export class FunnelStepEntity {
  @ApiProperty({ enum: FUNNEL_EVENTS, enumName: 'FunnelEvent' })
  event!: FunnelEvent;

  @ApiProperty({ type: ComparedValueEntity, description: 'Times the event fired' })
  count!: ComparedValueEntity;
}

export class FunnelTransitionEntity {
  @ApiProperty({ enum: FUNNEL_EVENTS, enumName: 'FunnelEvent' })
  from!: FunnelEvent;

  @ApiProperty({ enum: FUNNEL_EVENTS, enumName: 'FunnelEvent' })
  to!: FunnelEvent;

  @ApiProperty({
    description: 'Share (0…1) of `from` that reached `to` in the period; null when `from` is 0',
    type: Number,
    nullable: true,
    example: 0.3,
  })
  rate!: number | null;

  @ApiProperty({
    description: 'The same share in the comparison range; null when its `from` is 0',
    type: Number,
    nullable: true,
    example: 0.27,
  })
  previousRate!: number | null;
}

/**
 * «Відвідуваність і воронка» (TASK-689, plan 188) — add to cart → begin
 * checkout → purchase, entirely from Umami.
 *
 * Three states, like `TrafficSummaryEntity`, because "0%" and "we do not know"
 * look the same on a card and mean the opposite:
 * - `configured: false` — Umami was never wired up;
 * - `configured: true, available: false` — it did not answer;
 * - both true — the numbers are real (a real 0 is possible and shown).
 * In the first two states every number is `null`, never 0.
 *
 * Nothing here comes from our orders: Umami and our database count different
 * people (ad-blockers, logged-out tabs), and a ratio built from both sources
 * has an error nobody can estimate. Counts are EVENTS, not distinct visitors.
 */
export class FunnelReportEntity {
  @ApiProperty({ type: ReportPeriodEntity })
  period!: ReportPeriodEntity;

  @ApiProperty({ description: 'Analytics credentials are present on the server' })
  configured!: boolean;

  @ApiProperty({ description: 'The analytics service answered this request' })
  available!: boolean;

  @ApiProperty({
    type: [FunnelStepEntity],
    nullable: true,
    description: 'The three steps in order; null unless available',
  })
  steps!: FunnelStepEntity[] | null;

  @ApiProperty({
    type: [FunnelTransitionEntity],
    nullable: true,
    description: 'Step-to-step shares; null unless available',
  })
  transitions!: FunnelTransitionEntity[] | null;

  @ApiProperty({
    description: 'purchase ÷ add_to_cart in the period, 0…1; null when unknown or add_to_cart is 0',
    type: Number,
    nullable: true,
    example: 0.12,
  })
  conversion!: number | null;

  @ApiProperty({
    description: 'The same in the comparison range',
    type: Number,
    nullable: true,
    example: 0.1,
  })
  previousConversion!: number | null;
}
