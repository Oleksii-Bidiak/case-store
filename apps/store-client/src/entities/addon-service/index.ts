// Add-on service entity (TASK-174) — re-exports the generated types for the
// resolved add-ons the cart offers per line (warranty / insurance / setup).
//
// There is no standalone query hook here on purpose: the storefront always reads
// add-ons through `GET /cart`, which already carries `availableAddons` per line
// (resolved server-side in one batched pass). Upper layers import the type from
// here rather than reaching into the generated client directly.
export type {
  ResolvedAddonEntity,
  ResolvedAddonEntitySource,
} from "@/shared/api/generated/models";
