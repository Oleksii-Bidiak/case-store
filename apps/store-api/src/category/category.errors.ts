import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

/**
 * Stable, machine-readable error codes for category tree / reorder failures.
 *
 * These travel to the client in the HTTP error envelope's `error` field (see
 * {@link HttpExceptionFilter}, which surfaces ONLY `resp.error` and `resp.message` —
 * any extra property on the thrown body is silently discarded). The admin panel keys
 * its localized (UA) announcements off these codes — keep the string values stable.
 */
export const CategoryErrorCode = {
  /** The post-batch adjacency map would contain a cycle (incl. multi-move cycles). */
  CYCLE: 'CATEGORY_CYCLE',
  /** A moved node's subtree would exceed {@link MAX_CATEGORY_TREE_LEVELS}. */
  MAX_DEPTH: 'CATEGORY_MAX_DEPTH',
  /** A group's `parentId` also appears in that group's `orderedIds`. */
  SELF_PARENT: 'CATEGORY_SELF_PARENT',
  /** The same category id appears more than once across or within groups. */
  DUPLICATE_ID: 'CATEGORY_DUPLICATE_ID',
  /** An unknown category id, or an unknown non-null `parentId`. */
  NOT_FOUND: 'CATEGORY_NOT_FOUND',
  /** A described bucket's child SET changed underneath the client (concurrent reparent). */
  TREE_STALE: 'CATEGORY_TREE_STALE',
  /**
   * A delete request named neither or both move modes (TASK-652): exactly one of
   * `moveToId` / `moveToNew` is required, because products are never deleted with
   * their category (decision B-2 of plan 178).
   */
  MOVE_TARGET_REQUIRED: 'CATEGORY_MOVE_TARGET_REQUIRED',
  /**
   * The move target of a delete (or the parent of a target created by it) lies
   * inside the subtree being deleted — the products would move into a category the
   * same request tombstones (TASK-652).
   */
  MOVE_TARGET_IN_SUBTREE: 'CATEGORY_MOVE_TARGET_IN_SUBTREE',
  /** The move target (or the new target's parent) does not exist or is deleted. */
  MOVE_TARGET_NOT_FOUND: 'CATEGORY_MOVE_TARGET_NOT_FOUND',
  /** The slug a new move target would take is already held by another category. */
  SLUG_CONFLICT: 'CATEGORY_SLUG_CONFLICT',
} as const;

export type CategoryErrorCode = (typeof CategoryErrorCode)[keyof typeof CategoryErrorCode];

/**
 * Base class for the PURE domain errors thrown by `category-reorder.rules.ts` and by
 * `CategoryRepository`'s in-transaction guards. These carry no HTTP concern: the
 * service layer catches them and maps them onto the helpers below.
 */
export abstract class CategoryDomainError extends Error {
  protected constructor(
    readonly code: CategoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The batch would commit a cycle (an ancestor placed under its own descendant). */
export class CategoryCycleError extends CategoryDomainError {
  constructor(message = 'Cannot set parent to a descendant category (circular reference)') {
    super(CategoryErrorCode.CYCLE, message);
  }
}

/** A moved node's subtree would be deeper than the tree reads can represent. */
export class CategoryMaxDepthError extends CategoryDomainError {
  constructor(message = 'Category tree depth limit exceeded') {
    super(CategoryErrorCode.MAX_DEPTH, message);
  }
}

/** A category was asked to become its own parent. */
export class CategorySelfParentError extends CategoryDomainError {
  constructor(message = 'A category cannot be its own parent') {
    super(CategoryErrorCode.SELF_PARENT, message);
  }
}

/** The same category id was listed more than once in the payload. */
export class CategoryDuplicateIdError extends CategoryDomainError {
  constructor(message = 'A category id appears more than once in the payload') {
    super(CategoryErrorCode.DUPLICATE_ID, message);
  }
}

/** An unknown category id or an unknown non-null parent id was referenced. */
export class CategoryNotFoundError extends CategoryDomainError {
  constructor(message = 'Category not found') {
    super(CategoryErrorCode.NOT_FOUND, message);
  }
}

/** A described bucket's membership changed underneath the client — a lost update. */
export class CategoryTreeStaleError extends CategoryDomainError {
  constructor(message = 'The category tree changed since it was loaded — reload and retry') {
    super(CategoryErrorCode.TREE_STALE, message);
  }
}

/**
 * A delete request's move target — or the parent of the target it creates — is
 * inside the subtree being deleted (TASK-652). Decided authoritatively under the
 * tree advisory lock in `CategoryRepository.deleteSubtreeWithMove`.
 */
export class CategoryMoveTargetInSubtreeError extends CategoryDomainError {
  constructor(message = 'The move target must be outside the category subtree being deleted') {
    super(CategoryErrorCode.MOVE_TARGET_IN_SUBTREE, message);
  }
}

/** The move target (or the new target's parent) does not exist or is deleted (TASK-652). */
export class CategoryMoveTargetNotFoundError extends CategoryDomainError {
  constructor(message = 'Move target category not found') {
    super(CategoryErrorCode.MOVE_TARGET_NOT_FOUND, message);
  }
}

/** A new move target's slug collided with an existing category's slug (TASK-652). */
export class CategorySlugConflictError extends CategoryDomainError {
  constructor(message = 'A category with this slug already exists') {
    super(CategoryErrorCode.SLUG_CONFLICT, message);
  }
}

/**
 * Build a 400 BadRequest carrying a stable category error code. Used for rejected
 * moves the operator can fix (cycle, max depth, self-parent, duplicate id).
 */
export function badCategory(code: CategoryErrorCode, message: string): BadRequestException {
  return new BadRequestException({ error: code, message });
}

/**
 * Build a 404 NotFound carrying a stable category error code. Used when the payload
 * references a category id (or parent id) that does not exist.
 */
export function notFoundCategory(code: CategoryErrorCode, message: string): NotFoundException {
  return new NotFoundException({ error: code, message });
}

/**
 * Build a 409 Conflict carrying a stable category error code. Used for staleness —
 * the payload is well-formed, but another admin changed the tree first, which is a
 * state conflict rather than bad input.
 */
export function conflictCategory(code: CategoryErrorCode, message: string): ConflictException {
  return new ConflictException({ error: code, message });
}
