import { ApiProperty } from '@nestjs/swagger';
import { SeoHealthEntity } from '../entities';

/**
 * `{ data: SeoHealthEntity }` envelope for `GET /api/admin/seo-settings/health`
 * (TASK-269). Follows the dashboard module's `dto/`-hosted-envelope convention
 * (NeedsActionResponse) — the current house style for new response envelopes —
 * rather than the sibling SeoSettingsResponseEnvelope declared inline in the
 * controller (left untouched, no refactor-for-consistency scope creep).
 */
export class SeoHealthResponseEnvelope {
  @ApiProperty({ type: SeoHealthEntity })
  data!: SeoHealthEntity;
}
