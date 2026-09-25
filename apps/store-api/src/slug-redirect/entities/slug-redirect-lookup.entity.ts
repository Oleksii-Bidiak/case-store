import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Lookup result for a dead slug (TASK-285-D): the entity's CURRENT live slug
 * the visitor should be permanently redirected to. The write-time
 * chain-collapse invariant guarantees this is always a direct, single-hop
 * target — never another dead slug.
 */
export class SlugRedirectLookupEntity {
  @ApiProperty({
    description: 'The current live slug the old address permanently redirects to',
    example: 'nova-adresa',
  })
  newSlug!: string;

  /**
   * TASK-566 — the namespace the live slug is served under. Present only for
   * entities with several route families: for PAGE it is the page kind
   * (`LEGAL` → `/legal/<newSlug>`, `INFO` → `/info/<newSlug>`), which may differ
   * from the kind of the requested address when the page moved.
   */
  @ApiPropertyOptional({
    description:
      'Namespace of the live address — for PAGE the page kind (LEGAL / INFO) whose route serves newSlug. Absent for single-namespace entities.',
    example: 'INFO',
  })
  newScope?: string;
}
