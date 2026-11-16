/**
 * The views and orderings of the admin media list (TASK-1730).
 *
 * Fixed vocabularies, not free text: each value selects one SQL fragment the
 * repository already holds, so nothing an operator types ever becomes part of a
 * query's shape. The DTO validates against these same arrays.
 */

/**
 * - `all` — every asset matching the search/tag filters.
 * - `unused` — referenced from nowhere, by the SAME definition the delete gate
 *   uses (see `MediaUsageRepository.unreferencedPredicate`).
 * - `noAlt` — no alt text (`alt IS NULL`; the service stores a blank alt as null).
 */
export const MEDIA_LIST_VIEWS = ['all', 'unused', 'noAlt'] as const;
export type MediaListView = (typeof MEDIA_LIST_VIEWS)[number];
export const DEFAULT_MEDIA_LIST_VIEW: MediaListView = 'all';

/**
 * - `newest` — «Спершу нові», upload time descending (the default).
 * - `oldest` — upload time ascending.
 * - `largest` — stored size descending: what to look at first when tidying up.
 *
 * Every ordering ends with `id asc`, so rows that tie never swap between pages.
 */
export const MEDIA_LIST_SORTS = ['newest', 'oldest', 'largest'] as const;
export type MediaListSort = (typeof MEDIA_LIST_SORTS)[number];
export const DEFAULT_MEDIA_LIST_SORT: MediaListSort = 'newest';

/**
 * How many assets each view would hold under the current search/tag filters —
 * deliberately NOT narrowed by the view itself, so the tabs can show all three
 * numbers at once.
 */
export interface MediaListCounts {
  all: number;
  unused: number;
  noAlt: number;
}
