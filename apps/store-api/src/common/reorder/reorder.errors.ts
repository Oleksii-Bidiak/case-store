import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for FLAT (single-bucket) reorder failures — the
 * resource-agnostic twin of `category/category.errors.ts` (TASK-295).
 *
 * Deliberately NOT per-resource: banners, blog categories and device brands all fail in
 * exactly the same three ways, and one code family means the admin panel can key ONE set
 * of localized (UA) announcements off it for every sortable list. The category tree keeps
 * its own family because its failures (cycle / depth / self-parent) have no flat analogue.
 *
 * These travel to the client in the HTTP error envelope's `error` field (see
 * {@link HttpExceptionFilter}, which surfaces ONLY `resp.error` and `resp.message` — any
 * extra property on the thrown body is silently discarded). Keep the string values stable.
 */
export const ReorderErrorCode = {
  /** The same id appears more than once in `orderedIds`. */
  DUPLICATE_ID: 'REORDER_DUPLICATE_ID',
  /** An id in `orderedIds` does not exist in the bucket being reordered. */
  NOT_FOUND: 'REORDER_NOT_FOUND',
  /** The bucket's membership changed underneath the client — a lost update. */
  STALE: 'REORDER_STALE',
} as const;

export type ReorderErrorCode = (typeof ReorderErrorCode)[keyof typeof ReorderErrorCode];

/**
 * Base class for the PURE domain errors thrown by `flat-reorder.util.ts`. These carry no
 * HTTP concern: the service layer catches them and maps them via {@link reorderErrorToHttp}.
 */
export abstract class ReorderDomainError extends Error {
  protected constructor(
    readonly code: ReorderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The same id was listed more than once in the payload. */
export class ReorderDuplicateIdError extends ReorderDomainError {
  constructor(message = 'An id appears more than once in the payload') {
    super(ReorderErrorCode.DUPLICATE_ID, message);
  }
}

/** The payload named an id that is not a member of the bucket being reordered. */
export class ReorderNotFoundError extends ReorderDomainError {
  constructor(message = 'Item not found in this list') {
    super(ReorderErrorCode.NOT_FOUND, message);
  }
}

/** The bucket gained a row after the client read it — the payload is a partial ordering. */
export class ReorderStaleError extends ReorderDomainError {
  constructor(message = 'The list changed since it was loaded — reload and retry') {
    super(ReorderErrorCode.STALE, message);
  }
}

/**
 * Map a flat-reorder domain error onto its HTTP status. Anything that is NOT a
 * {@link ReorderDomainError} (a Prisma failure, a dropped connection) is returned UNTOUCHED,
 * so the global filter still turns it into a 500 rather than a misleading 4xx.
 *
 * The thrown bodies are built exactly as `category.errors.ts` builds its own
 * (`{ error, message }`), because {@link HttpExceptionFilter} rebuilds the envelope from
 * those two properties alone — the stable code would otherwise never reach the wire.
 */
export function reorderErrorToHttp(error: unknown): Error {
  if (!(error instanceof ReorderDomainError)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const body = { error: error.code, message: error.message };

  switch (error.code) {
    case ReorderErrorCode.NOT_FOUND:
      return new NotFoundException(body);
    case ReorderErrorCode.STALE:
      return new ConflictException(body);
    default:
      return new BadRequestException(body);
  }
}
