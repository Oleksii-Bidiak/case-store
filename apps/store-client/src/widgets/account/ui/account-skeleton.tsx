import type { ReactNode } from "react";
import { PAGE_CONTAINER } from "@/shared/config";
import { Skeleton } from "@/shared/ui";
import { ACCOUNT_NAV } from "./account-nav";

/** Label bar widths per menu entry, roughly the length of the real labels. */
const NAV_LABEL_WIDTH: Record<string, string> = {
  profile: "w-24",
  orders: "w-32",
  favorites: "w-14",
  purchases: "w-16",
  history: "w-32",
  bonuses: "w-14",
  compare: "w-24",
  settings: "w-26",
};

/** Chip widths in the strip: the label width + the chip's `px-4` each side. */
const CHIP_WIDTH: Record<string, string> = {
  profile: "w-32",
  orders: "w-40",
  favorites: "w-22",
  purchases: "w-24",
  history: "w-40",
  bonuses: "w-22",
  compare: "w-32",
  settings: "w-34",
};

/** One form field of ProfileForm: a 14px `Label`, `gap-1.5`, a 36px `Input`. */
function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

/** The shell shared by the contact and security cards of the profile section. */
const CARD_CLASS =
  "rounded-card border border-border bg-card p-6.5 shadow-card";

export interface AccountShellSkeletonProps {
  /**
   * The order-detail layout: below `lg` neither the back-home line nor the
   * strip — the detail screen brings its own «← Історія замовлень».
   */
  detail?: boolean;
  /** The content column's own skeleton, if the route has one. */
  children?: ReactNode;
}

/**
 * AccountShellSkeleton — the account frame with its content blanked out, block
 * for block (TASK-869), rendered by AccountShell while the session and the
 * profile load:
 *
 * - AccountShell's container (`PAGE_CONTAINER pt-5.5 pb-16`) and the «На
 *   головну» back-link line with its `mb-5.5` (hidden below `lg` on an order
 *   detail);
 * - below `lg`, the chip strip — one 44px chip per ACCOUNT_NAV entry, bleeding
 *   to the screen edge like the real one (absent on an order detail);
 * - from `lg`, the 264px menu card beside the fluid content (`gap-7`): the
 *   avatar header, exactly as many 42px rows as ACCOUNT_NAV shows, then the
 *   «Вихід» row.
 *
 * The content column is the route's: `AccountProfileSkeleton` for `/account`.
 * The dashboard's raw px (`pt-[22px]`, `[264px_1fr]`…) are spelled on the
 * spacing scale (`pt-5.5`, a flex row with a `w-66` menu) — the same geometry
 * without an arbitrary value. Server-compatible.
 */
export function AccountShellSkeleton({
  detail = false,
  children,
}: AccountShellSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="account-skeleton"
      className={`${PAGE_CONTAINER} pt-5.5 pb-16`}
    >
      {/* «Повернутись на головну» */}
      <div
        data-testid="account-skeleton-back"
        className={`mb-5.5 h-5 items-center gap-2 ${detail ? "hidden lg:flex" : "flex"}`}
      >
        <Skeleton className="size-4.5 rounded-full" />
        <Skeleton className="h-3.5 w-36" />
      </div>

      {/* Section chips (below lg) — the geometry of AccountSectionStrip. */}
      {!detail && (
        <div
          data-testid="account-skeleton-strip"
          className="-mx-4 -mt-1 mb-5 flex gap-2 overflow-hidden px-4 py-1 sm:-mx-6 sm:px-6 lg:hidden"
        >
          {ACCOUNT_NAV.map((entry) => (
            <Skeleton
              key={entry.key}
              data-testid="account-skeleton-chip"
              className={`h-11 shrink-0 rounded-full ${CHIP_WIDTH[entry.key] ?? "w-28"}`}
            />
          ))}
        </div>
      )}

      <div
        data-testid="account-skeleton-layout"
        className="flex flex-col gap-7 lg:flex-row lg:items-start"
      >
        {/* Menu card (lg+) */}
        <div
          data-testid="account-skeleton-aside"
          className="hidden rounded-card border border-border bg-card p-2 shadow-card lg:block lg:w-66 lg:shrink-0"
        >
          <div className="flex items-center gap-3 px-3 pt-3.5 pb-4">
            <Skeleton className="size-11.5 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="mx-1 mb-1.5 h-px bg-border" />

          {/* A flex column like the real `<nav>`: the last row's `mb-0.5`
              must not collapse into the divider's `my-1.5` below. */}
          <div data-testid="account-skeleton-nav" className="flex flex-col">
            {ACCOUNT_NAV.map((entry) => (
              <div
                key={entry.key}
                data-testid="account-skeleton-nav-row"
                className="mb-0.5 flex h-10.5 items-center gap-3 px-3.5"
              >
                <Skeleton className="size-5 shrink-0" />
                <Skeleton
                  className={`h-3.5 ${NAV_LABEL_WIDTH[entry.key] ?? "w-24"}`}
                />
              </div>
            ))}
          </div>

          <div className="mx-1 my-1.5 h-px bg-border" />
          {/* «Вихід» */}
          <div className="flex h-10.5 items-center gap-3 px-3.5">
            <Skeleton className="size-5 shrink-0" />
            <Skeleton className="h-3.5 w-12" />
          </div>
        </div>

        <div
          data-testid="account-skeleton-content"
          className="min-w-0 lg:flex-1"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * AccountProfileSkeleton — the «Особисті дані» section blanked out: the h1
 * slot at H1_CLASS line heights (`h-9 md:h-10`), the email-verification block,
 * the contact card (email, name row that is two columns from `sm`, phone, save
 * button) and the security card, whose note wraps onto two lines below `sm`.
 *
 * Content-only: it sits in AccountShell's content column (from the shell's own
 * loading branch, `app/account/loading.tsx`, the page's `<Suspense>` fallback
 * and AccountView's loading branch), so it carries no container.
 *
 * The verification block is the one part whose height depends on data the
 * skeleton cannot have: the access token carries only `sub` + `role`, and the
 * profile request is exactly what this skeleton stands in for. It reserves the
 * **unverified** card on purpose — every new registration starts there, and so
 * does the seeded demo customer — so for those accounts nothing below the h1
 * moves. The honest cost: for an already verified address the card collapses
 * to the one-line «Адресу підтверджено» status, and the contact and security
 * cards rise by 138px (158px at 390, where the body wraps). Content moving up
 * into place, not down under the cursor; documented in design-system.md
 * §Loading. Server-compatible.
 */
export function AccountProfileSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="account-profile-skeleton"
      className="w-full max-w-170 min-w-0"
    >
      <div
        data-testid="account-skeleton-title"
        className="mb-6 flex h-9 items-center md:h-10"
      >
        <Skeleton className="h-7 w-52 md:h-8 md:w-64" />
      </div>

      {/* «Адресу не підтверджено» card — the reserved verification state
          (see the doc comment): AccountEmailVerification's unverified
          branch, `rounded-2xl p-6 mb-4`, title, body, resend button. */}
      <div
        data-testid="account-skeleton-verification"
        className="mb-4 rounded-2xl border border-border bg-card p-6 shadow-card"
      >
        <div className="mb-1.5 flex h-7 items-center">
          <Skeleton className="h-5 w-56" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-full sm:w-120" />
        </div>
        <div
          data-testid="account-skeleton-verification-wrap"
          className="flex h-5 items-center sm:hidden"
        >
          <Skeleton className="h-3.5 w-1/2" />
        </div>
        {/* `mt-4` = the body's `mb-4`; the button is `py-2` + a 20px line
            + a 1px border each side = 38px. */}
        <Skeleton className="mt-4 h-9.5 w-48" />
      </div>

      {/* «Контактна інформація» */}
      <div data-testid="account-skeleton-card" className={CARD_CLASS}>
        <div className="mb-4 flex h-7 items-center">
          <Skeleton className="h-5 w-52" />
        </div>
        <div className="flex flex-col gap-4">
          <FieldSkeleton />
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
          <FieldSkeleton />
          <Skeleton className="h-9 w-34" />
        </div>
      </div>

      {/* «Безпека» */}
      <div
        data-testid="account-skeleton-card"
        className={`mt-4.5 ${CARD_CLASS}`}
      >
        <div className="mb-1.5 flex h-7 items-center">
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-full sm:w-96" />
        </div>
        <div
          data-testid="account-skeleton-note-wrap"
          className="flex h-5 items-center sm:hidden"
        >
          <Skeleton className="h-3.5 w-1/3" />
        </div>
        {/* «Змінити пароль» + «Змінити email»: inline outline buttons,
            each `mt-4`, `ml-2` between them from `sm`. */}
        <div className="mt-4 flex flex-wrap gap-y-4 sm:gap-x-2">
          <Skeleton className="h-9 w-35" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
    </div>
  );
}
