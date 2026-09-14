/**
 * What did NOT land when a freshly created product's staged panels were replayed
 * (TASK-442), handed from `CreateProductView` to `EditProductView`.
 *
 * WHY A MODULE SLOT AND NOT A QUERY PARAM OR STORAGE.
 * `POST /products` succeeds, then four `:id`-keyed endpoints replay what the
 * operator staged, and a partial failure rolls back NOTHING — the product
 * exists, it is hidden, and that is the important part. What is left is telling
 * the operator precisely which pieces to redo, on the page that can redo them.
 *
 *   - A query param would live in the edit URL forever — a URL the operator
 *     bookmarks and re-opens, re-showing a stale failure on every visit.
 *   - `sessionStorage` can throw outright (private windows, blocked site data),
 *     and a report that silently evaporates is worse than no mechanism.
 *
 * Both views are client components inside one SPA runtime, so a module slot
 * survives exactly as long as the hand-off needs to: the client-side navigation
 * between them. A full reload drops it, by which point the edit page itself —
 * the gallery, the specs, the compat checkboxes — is the honest report.
 *
 * ONE SLOT, NOT A MAP: only one product can be created at a time, and a single
 * slot cannot leak or go stale beyond its own replacement. `read` is keyed by
 * product id so an unrelated edit page never picks up someone else's report, and
 * it does NOT clear on read — a lazy `useState` initializer runs twice under
 * React StrictMode, and a read-and-delete would lose the report on the second
 * call.
 */
export interface CreateCarryoverFailures {
  /** File names of photos the upload queue could not place. */
  images: string[];
  /** The structured-spec payload was rejected. */
  specs: boolean;
  /** The device-compat set was rejected. */
  compat: boolean;
  /** Names of the add-on services whose delta was rejected. */
  addons: string[];
}

let slot: { productId: string; failures: CreateCarryoverFailures } | null =
  null;

export function stashCreateCarryover(
  productId: string,
  failures: CreateCarryoverFailures,
): void {
  slot = { productId, failures };
}

export function readCreateCarryover(
  productId: string,
): CreateCarryoverFailures | null {
  return slot?.productId === productId ? slot.failures : null;
}

export function clearCreateCarryover(): void {
  slot = null;
}

/** Did anything at all fail? Cheaper to ask here than at four call sites. */
export function hasCarryoverFailures(
  failures: CreateCarryoverFailures,
): boolean {
  return (
    failures.images.length > 0 ||
    failures.specs ||
    failures.compat ||
    failures.addons.length > 0
  );
}
