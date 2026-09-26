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
   * Resolve a dead address to the entity's current live slug, or null when the
   * address never redirected (or is currently live).
   *
   * `scope` is the namespace of the dead address (TASK-566) — for PAGE the page
   * kind whose route was requested; omitted for single-namespace entities. The
   * answer carries `newScope` only when the live address has a namespace, so a
   * product/category/blog/device-model answer is exactly what it always was.
   */
  async lookup(
    entity: SlugRedirectEntity,
    slug: string,
    scope?: string,
  ): Promise<SlugRedirectLookupEntity | null> {
    const redirect = await this.slugRedirectRepository.findRedirect(entity, slug, scope ?? '');
    if (!redirect) {
      return null;
    }
    const result = new SlugRedirectLookupEntity();
    result.newSlug = redirect.newSlug;
    if (redirect.newScope) {
      result.newScope = redirect.newScope;
    }
    return result;
  }
}
