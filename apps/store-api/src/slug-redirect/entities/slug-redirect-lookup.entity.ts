import { ApiProperty } from '@nestjs/swagger';

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
}
