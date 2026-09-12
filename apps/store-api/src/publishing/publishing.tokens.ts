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
   * OPTIONAL counterpart of {@link publishDue} (TASK-429): take back down every
   * row whose publication window has CLOSED as of `now`, returning the number of
   * rows unpublished so the scheduler knows whether a revalidation is warranted.
   *
   * Optional because only Banner has a window end today — Pages, blog posts and
   * carousels model a start (`scheduledAt`) and nothing else, and a port that
   * does not implement this is simply skipped. Implement it ONLY when the model
   * has its own end column; do not fake an end from `scheduledAt`.
   */
  unpublishExpired?(now: Date): Promise<number>;

  /**
   * Cache-revalidation target purged when {@link publishDue} or
   * {@link unpublishExpired} flips ≥1 row.
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
