/**
 * Domain-side pagination shapes (TASK-806).
 *
 * Services return a `Paginated<T>` — the page of items plus its counters — and
 * the controller turns it into the `{ data, meta }` response envelope. The
 * envelope is an HTTP concern, so its `data` key never appears below the
 * controller (enforced by `no-restricted-syntax` in eslint.config.js).
 *
 * The Swagger `*PaginationMeta` classes in controllers describe the same counters
 * on the wire; this interface is what a service promises, not what OpenAPI shows.
 */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * One page of a list. `M` lets a list carry extra counters next to the standard
 * ones (the contact inbox's `unread`) without a second envelope shape.
 */
export interface Paginated<T, M extends PaginationMeta = PaginationMeta> {
  items: T[];
  meta: M;
}
