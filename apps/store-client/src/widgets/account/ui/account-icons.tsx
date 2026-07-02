import type { ReactNode, SVGProps } from "react";

// Sidebar nav glyphs copied from the Claude Design "Account.dc.html" mockup so
// the dashboard renders pixel-identically. All inherit `currentColor`.

export type AccountIconName =
  | "profile"
  | "orders"
  | "favorites"
  | "purchases"
  | "history"
  | "bonuses"
  | "compare"
  | "settings";

const PATHS: Record<AccountIconName, ReactNode> = {
  profile: (
    <>
      <path d="M20 21a8 8 0 1 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </>
  ),
  orders: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  favorites: (
    <path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5 6 5c2 0 3 1.2 4 2.5C11 6.2 12 5 14 5c3.5 0 5 4 3.5 7C19 16.5 12 21 12 21z" />
  ),
  purchases: (
    <>
      <path d="M6 7h12l1 13H5z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  bonuses: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 12.5l1.8 1.8 3.4-4" />
    </>
  ),
  compare: (
    <>
      <path d="M12 4v16" />
      <path d="M4 8l4-3 4 3" />
      <path d="M20 8l-4-3-4 3" />
      <path d="M3 12h6l-3 5z" />
      <path d="M21 12h-6l3 5z" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 6.8 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.4H3a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 4.6 6.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 3V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8" />
    </>
  ),
};

export function AccountIcon({
  name,
  ...props
}: { name: AccountIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}

export function AccountLogoutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function AccountBackIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
