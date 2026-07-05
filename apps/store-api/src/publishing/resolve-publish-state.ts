import { PublishStatus } from '@prisma/client';

/**
 * Admin-supplied publish intent for a content row.
 */
export interface PublishStateInput {
  status: PublishStatus;
  scheduledAt?: Date | null;
}

/**
 * Normalised persisted publish fields — exactly what a repository writes.
 */
export interface ResolvedPublishState {
  status: PublishStatus;
  publishedAt: Date | null;
  scheduledAt: Date | null;
}

/**
 * Pure semantic core of the publishing pattern (TASK-187). Given the admin's
 * intended `status` (+ optional `scheduledAt`) and the current instant, resolve
 * the canonical persisted fields. Shared verbatim by Pages, blog, and banners.
 *
 * Rules:
 * - `PUBLISHED`  → live now: `publishedAt = now`, `scheduledAt = null`.
 * - `SCHEDULED` with a FUTURE `scheduledAt` → stays queued: keep `scheduledAt`,
 *   `publishedAt = null`.
 * - `SCHEDULED` with a PAST or ABSENT `scheduledAt` → collapses to `PUBLISHED`
 *   immediately (`publishedAt = now`, `scheduledAt = null`) — you cannot
 *   schedule into the past.
 * - `DRAFT` → both timestamps null.
 *
 * Note: for an already-published row a caller that wants to preserve the
 * ORIGINAL publish time should keep its stored `publishedAt` rather than the
 * `now` returned here (see PageService.update).
 */
export function resolvePublishState(input: PublishStateInput, now: Date): ResolvedPublishState {
  const { status, scheduledAt } = input;

  if (status === PublishStatus.PUBLISHED) {
    return { status: PublishStatus.PUBLISHED, publishedAt: now, scheduledAt: null };
  }

  if (status === PublishStatus.SCHEDULED) {
    // Scheduling into the past (or with no date) makes no sense → publish now.
    if (!scheduledAt || scheduledAt.getTime() <= now.getTime()) {
      return { status: PublishStatus.PUBLISHED, publishedAt: now, scheduledAt: null };
    }
    return { status: PublishStatus.SCHEDULED, publishedAt: null, scheduledAt };
  }

  // DRAFT (and any unexpected value) → fully unpublished.
  return { status: PublishStatus.DRAFT, publishedAt: null, scheduledAt: null };
}
