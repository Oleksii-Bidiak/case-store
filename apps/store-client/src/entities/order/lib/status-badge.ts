/**
 * One badge-colour map for every order and payment status the storefront shows
 * (TASK-802). The lookup result, the confirmation header (and through it the
 * guest order view) and the order history all read this map, so one status
 * never looks like two things on two pages.
 *
 * Why one map for two enums: `PENDING` and `REFUNDED` exist in both
 * `OrderStatus` and `PaymentStatus`, and they have always been painted the same
 * — the LABELS differ (see the two maps in `dictionary.ts`), the colour does not.
 *
 * Before this file there were three copies, and only one of them knew
 * `PARTIALLY_REFUNDED` (TASK-431): on the confirmation page it fell through to
 * the grey fallback — the same colour as `PENDING` — under the correct label.
 *
 * The colours are the ones the three copies had on the day they were merged.
 * Recolouring by design-system §2 is TASK-868 (plan 197), not this file's job.
 * Token classes only, never raw hex.
 */
export const STATUS_BADGE: Readonly<Record<string, string>> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-primary/10 text-primary",
  PROCESSING: "bg-primary/20 text-primary",
  SHIPPED: "bg-primary/30 text-primary",
  DELIVERED: "bg-primary/10 text-primary font-semibold",
  CANCELLED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-destructive/10 text-destructive",
  PARTIALLY_REFUNDED: "bg-destructive/10 text-destructive",
  PAID: "bg-primary/10 text-primary",
  FAILED: "bg-destructive/10 text-destructive",
};

/** Colour for a status the map does not know — a new enum value, say. */
export const STATUS_BADGE_FALLBACK = "bg-muted text-muted-foreground";

/** Badge classes for an order OR payment status value. */
export function statusBadgeClass(value: string): string {
  return STATUS_BADGE[value] ?? STATUS_BADGE_FALLBACK;
}
