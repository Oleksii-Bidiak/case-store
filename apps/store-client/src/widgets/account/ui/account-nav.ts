import { FEATURE_STUBS } from "@/shared/config";
import type { AccountIconName } from "./account-icons";

export interface AccountNavEntry {
  key: string;
  icon: AccountIconName;
  /** When set the item navigates to an existing page instead of switching. */
  href?: string;
}

const ALL_NAV: AccountNavEntry[] = [
  { key: "profile", icon: "profile" },
  { key: "orders", icon: "orders", href: "/orders" },
  { key: "favorites", icon: "favorites", href: "/wishlist" },
  { key: "purchases", icon: "purchases" },
  { key: "history", icon: "history" },
  { key: "bonuses", icon: "bonuses" },
  { key: "compare", icon: "compare" },
  { key: "settings", icon: "settings" },
];

/**
 * The `/account` sidebar menu. Shared by AccountView and AccountSkeleton so the
 * skeleton reserves exactly as many rows as the real menu shows (TASK-869).
 *
 * «Порівняння» only ever opens a placeholder for a feature that does not exist
 * (TASK-085), so the entry is hidden unless the deployment opts into stubs
 * (TASK-419). The entry itself stays in ALL_NAV — this filter is the one line
 * TASK-085 deletes.
 */
export const ACCOUNT_NAV = ALL_NAV.filter(
  (entry) => FEATURE_STUBS || entry.key !== "compare",
);
