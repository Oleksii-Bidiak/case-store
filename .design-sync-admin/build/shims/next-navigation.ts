// design-sync shim for `next/navigation`. The data-table controls
// (TableSearch, TableFilters, TablePagination, PageSizeSelect) write their
// view state into the URL through useUrlParams → useRouter/usePathname/
// useSearchParams. Outside Next there is no router: reads come from the real
// location (so a design can seed `?page=2`), writes are no-ops.
const noop = () => {};
const router = {
  push: noop,
  replace: noop,
  refresh: noop,
  back: noop,
  forward: noop,
  prefetch: noop,
};

export function useRouter() {
  return router;
}

export function usePathname() {
  return typeof location === "undefined" ? "/" : location.pathname;
}

export function useSearchParams() {
  return new URLSearchParams(
    typeof location === "undefined" ? "" : location.search,
  );
}

export function useParams() {
  return {};
}

export function redirect() {}
export function notFound() {}
