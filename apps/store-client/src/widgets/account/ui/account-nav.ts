import { FEATURE_STUBS } from "@/shared/config";
import type { AccountIconName } from "./account-icons";

/**
 * The sections `/account` itself renders, picked by `?section=` (TASK-867).
 * Orders and favorites are not among them: they are routes of their own.
 */
export type AccountSectionKey =
  "profile" | "purchases" | "history" | "bonuses" | "compare" | "settings";

/** Every menu entry: the inline sections plus the two route entries. */
export type AccountNavKey = AccountSectionKey | "orders" | "favorites";

export interface AccountNavEntry {
  key: AccountNavKey;
  icon: AccountIconName;
  /** Where the entry goes. Every entry is a real link (TASK-867). */
  href: string;
}

/** The account's own base route; `/account` alone is the profile section. */
export const ACCOUNT_PATH = "/account";
/** The order history (TASK-217) — a section of the account, not `/orders`. */
export const ACCOUNT_ORDERS_PATH = "/account/orders";

const sectionHref = (key: AccountSectionKey) =>
  key === "profile" ? ACCOUNT_PATH : `${ACCOUNT_PATH}?section=${key}`;

const ALL_NAV: AccountNavEntry[] = [
  { key: "profile", icon: "profile", href: sectionHref("profile") },
  { key: "orders", icon: "orders", href: ACCOUNT_ORDERS_PATH },
  { key: "favorites", icon: "favorites", href: "/wishlist" },
  { key: "purchases", icon: "purchases", href: sectionHref("purchases") },
  { key: "history", icon: "history", href: sectionHref("history") },
  { key: "bonuses", icon: "bonuses", href: sectionHref("bonuses") },
  { key: "compare", icon: "compare", href: sectionHref("compare") },
  { key: "settings", icon: "settings", href: sectionHref("settings") },
];

/**
 * The account menu — the sidebar from `lg` and the chip strip below it, plus
 * the skeleton that reserves exactly as many rows as the real menu shows
 * (TASK-869).
 *
 * «Порівняння» only ever opens a placeholder for a feature that does not exist
 * (TASK-085), so the entry is hidden unless the deployment opts into stubs
 * (TASK-419). The entry itself stays in ALL_NAV — this filter is the one line
 * TASK-085 deletes.
 */
export const ACCOUNT_NAV = ALL_NAV.filter(
  (entry) => FEATURE_STUBS || entry.key !== "compare",
);

const SECTION_KEYS: readonly AccountSectionKey[] = [
  "profile",
  "purchases",
  "history",
  "bonuses",
  "compare",
  "settings",
];

/**
 * `?section=` → the section `/account` shows. Absent, unknown or hand-edited
 * values land on the profile, and so does `compare` while its entry is hidden
 * — a URL must not reach a section the menu does not offer.
 */
export function parseAccountSection(
  raw: string | null | undefined,
): AccountSectionKey {
  const key = SECTION_KEYS.find((candidate) => candidate === raw);
  if (!key || (key === "compare" && !FEATURE_STUBS)) return "profile";
  return key;
}

/** `/account/orders/<id>` — the order detail, which owns its own back link. */
export function isAccountOrderDetailPath(pathname: string): boolean {
  return (
    pathname.startsWith(`${ACCOUNT_ORDERS_PATH}/`) &&
    pathname.length > ACCOUNT_ORDERS_PATH.length + 1
  );
}

/**
 * Which menu entry the current URL belongs to: the order list and every order
 * detail are «Історія замовлень»; `/account` is whatever `?section=` names.
 * `null` for a path the menu has no entry for.
 */
export function activeAccountNavKey(
  pathname: string,
  sectionParam: string | null | undefined,
): AccountNavKey | null {
  if (
    pathname === ACCOUNT_ORDERS_PATH ||
    pathname.startsWith(`${ACCOUNT_ORDERS_PATH}/`)
  ) {
    return "orders";
  }
  if (pathname === ACCOUNT_PATH) return parseAccountSection(sectionParam);
  return null;
}
