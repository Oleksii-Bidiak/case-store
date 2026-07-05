/**
 * Cache-revalidation target a content module wants purged when its scheduled
 * rows go live. `tags` map to Next.js `revalidateTag`, `paths` to
 * `revalidatePath` on the storefront.
 */
export interface RevalidateTarget {
  tags: string[];
  paths?: string[];
}

/**
 * Port implemented by every content repository that participates in scheduled
 * publishing (Pages today; blog posts and banners later).
 *
 * A content module registers its repository under {@link PUBLISHABLE_REPOSITORY}
 * (a `useExisting` alias in that module); the {@link PublishingScheduler}
 * discovers every registered implementation via DiscoveryService and ticks it
 * once per cron interval.
 */
export interface PublishablePort {
  /**
   * Flip this model's due `SCHEDULED` rows to `PUBLISHED` as of `now`
   * (`scheduledAt <= now`). Returns the number of rows flipped so the scheduler
   * knows whether a revalidation is warranted.
   */
  publishDue(now: Date): Promise<number>;

  /**
   * Cache-revalidation target purged when {@link publishDue} flips ≥1 row.
   * Coarse-grained on purpose: the cron flips rows in bulk and does not know
   * individual slugs, so a model-wide tag (e.g. `pages`) covers all of them.
   */
  readonly revalidateTarget?: RevalidateTarget;
}

/**
 * DI token content modules register their repository under:
 *
 * ```ts
 * { provide: PUBLISHABLE_REPOSITORY, useExisting: PageRepository }
 * ```
 *
 * The {@link PublishingScheduler} collects every module's provider bound to this
 * token via DiscoveryService. (Nest has no Angular-style `multi`; one alias per
 * content module is the mechanism.)
 */
export const PUBLISHABLE_REPOSITORY = Symbol('PUBLISHABLE_REPOSITORY');
