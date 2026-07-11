import { Injectable } from '@nestjs/common';
import { SlugRedirectEntity } from '@prisma/client';
import { SlugRedirectRepository } from './slug-redirect.repository';
import { SlugRedirectLookupEntity } from './entities';

/**
 * Business logic for the public slug-redirect lookup (TASK-285-D). A thin
 * pass-through over the repository's O(1) unique-key read — all the actual
 * complexity lives at write time (chain collapse), never here.
 */
@Injectable()
export class SlugRedirectService {
  constructor(private readonly slugRedirectRepository: SlugRedirectRepository) {}

  /**
   * Resolve a dead slug to the entity's current live slug, or null when the
   * slug never redirected (or is currently live).
   */
  async lookup(entity: SlugRedirectEntity, slug: string): Promise<SlugRedirectLookupEntity | null> {
    const redirect = await this.slugRedirectRepository.findRedirect(entity, slug);
    if (!redirect) {
      return null;
    }
    const result = new SlugRedirectLookupEntity();
    result.newSlug = redirect.newSlug;
    return result;
  }
}
