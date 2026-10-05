/**
 * One badge map for every order and payment status the storefront shows
 * (TASK-802), coloured by design-system.md §2 (TASK-868). The lookup result, the
 * confirmation header (and through it the guest order view) and the order
 * history all render `OrderStatusBadge`, which reads this map, so one status
 * never looks like two things on two pages.
 *
 * Why one map for two enums: `PENDING` and `REFUNDED` exist in both
 * `OrderStatus` and `PaymentStatus`, and they are painted the same — the LABELS
 * differ (see the two maps in `dictionary.ts`), the colour does not.
 *
 * Before TASK-802 there were three copies, and only one of them knew
 * `PARTIALLY_REFUNDED` (TASK-431): on the confirmation page it fell through to
 * the grey fallback under the correct label.
 *
 * The groups (§2):
 * - in progress (`PENDING`, `CONFIRMED`, `PROCESSING`, `SHIPPED`) — shades of
 *   `primary`, one step darker per stage, so the pill fills as the order moves;
 * - `DELIVERED`, `PAID` — `success`;
 * - `REFUNDED`, `PARTIALLY_REFUNDED` — `muted`: money went back, nothing is
 *   wrong, and red here read as an error;
 * - `CANCELLED`, `FAILED` — `destructive`.
 *
 * Values are `shared/ui` `Badge` variants plus, for the progress shades, one
 * `bg-primary/NN` class that `cn` merges over the variant's own tint. Token
 * classes only, never raw hex.
 */
export type StatusBadgeVariant =
  "tint-primary" | "tint-success" | "tint-destructive" | "tint-muted";

export interface StatusBadgeStyle {
  variant: StatusBadgeVariant;
  /** A darker `primary` tint for the later in-progress stages. */
  shade?: string;
}

export const STATUS_BADGE: Readonly<Record<string, StatusBadgeStyle>> = {
  PENDING: { variant: "tint-primary" },
  CONFIRMED: { variant: "tint-primary", shade: "bg-primary/15" },
  PROCESSING: { variant: "tint-primary", shade: "bg-primary/20" },
  SHIPPED: { variant: "tint-primary", shade: "bg-primary/30" },
  DELIVERED: { variant: "tint-success" },
  PAID: { variant: "tint-success" },
  REFUNDED: { variant: "tint-muted" },
  PARTIALLY_REFUNDED: { variant: "tint-muted" },
  CANCELLED: { variant: "tint-destructive" },
  FAILED: { variant: "tint-destructive" },
};

/** Style for a status the map does not know — a new enum value, say. */
export const STATUS_BADGE_FALLBACK: StatusBadgeStyle = {
  variant: "tint-muted",
};

/** Badge style for an order OR payment status value. */
export function statusBadgeStyle(value: string): StatusBadgeStyle {
  return STATUS_BADGE[value] ?? STATUS_BADGE_FALLBACK;
}
