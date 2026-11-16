import {
  MediaListSort,
  MediaListView,
  type MediaControllerFindAllParams,
} from "@/entities/media";

/** What one page of the library is asked for (TASK-1730). */
export interface MediaListQuery {
  search: string;
  page: number;
  pageSize: number;
  view?: MediaListView;
  sort?: MediaListSort;
}

/**
 * The params of `GET /admin/media` for one page — the ONE place they are built.
 *
 * The grid fetches with these and the `/media` screen reads the per-view
 * counters with these, so both land on the same TanStack Query key and share a
 * single request. Two hand-built objects would differ by one optional key
 * sooner or later, and the tabs would quietly start a second fetch.
 *
 * Defaults are LEFT OUT rather than sent (`view=all`, `sort=newest`): the
 * picker never chooses either, and leaving them out keeps its request — and its
 * cache entry — identical to the default `/media` page.
 */
export function mediaListParams({
  search,
  page,
  pageSize,
  view,
  sort,
}: MediaListQuery): MediaControllerFindAllParams {
  return {
    search: search || undefined,
    view: view && view !== MediaListView.all ? view : undefined,
    sort: sort && sort !== MediaListSort.newest ? sort : undefined,
    page,
    limit: pageSize,
  };
}

/** `?view=` from the URL, or `all` for anything the API does not know. */
export function parseMediaListView(raw: string | null): MediaListView {
  return (
    Object.values(MediaListView).find((view) => view === raw) ??
    MediaListView.all
  );
}

/** `?sort=` from the URL, or `newest` for anything the API does not know. */
export function parseMediaListSort(raw: string | null): MediaListSort {
  return (
    Object.values(MediaListSort).find((sort) => sort === raw) ??
    MediaListSort.newest
  );
}
