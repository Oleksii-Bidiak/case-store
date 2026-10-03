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

/**
 * AccountSkeleton — the one loading placeholder for `/account` (TASK-869). The
 * route `loading.tsx`, the page's `<Suspense>` fallback and AccountView's own
 * loading branch all render it, and it is the dashboard with the content
 * blanked out, block for block:
 *
 * - AccountView's container (`PAGE_CONTAINER pt-5.5 pb-16`) and the «На
 *   головну» back-link line with its `mb-5.5`;
 * - the 264px menu card + fluid content from `lg` (`gap-7`), stacked below it —
 *   the menu reserves the avatar header and exactly as many 44px rows as
 *   ACCOUNT_NAV shows, then the «Вихід» row;
 * - the profile section: the h1 slot at H1_CLASS line heights (`h-9 md:h-10`),
 *   the «email confirmed» status line, the contact card (email, name row that
 *   is two columns from `sm`, phone, save button) and the security card, whose
 *   note wraps onto two lines below `sm`.
 *
 * The dashboard's raw px (`pt-[22px]`, `p-[26px]`, `max-w-[680px]`…) are spelled
 * on the spacing scale here (`pt-5.5`, `p-6.5`, `max-w-170`), and the
 * `[264px_1fr]` grid is a flex row with a `w-66` menu — the same geometry
 * without an arbitrary value. Server-compatible.
 */
export function AccountSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="account-skeleton"
      className={`${PAGE_CONTAINER} pt-5.5 pb-16`}
    >
      {/* «Повернутись на головну» */}
      <div
        data-testid="account-skeleton-back"
        className="mb-5.5 flex h-5 items-center gap-2"
      >
        <Skeleton className="size-4.5 rounded-full" />
        <Skeleton className="h-3.5 w-36" />
      </div>

      <div
        data-testid="account-skeleton-layout"
        className="flex flex-col gap-7 lg:flex-row lg:items-start"
      >
        {/* Menu card */}
        <div
          data-testid="account-skeleton-aside"
          className="rounded-card border border-border bg-card p-2 shadow-card lg:w-66 lg:shrink-0"
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

        {/* Content: the «Особисті дані» section */}
        <div className="w-full max-w-170 min-w-0 lg:flex-1">
          <div
            data-testid="account-skeleton-title"
            className="mb-6 flex h-9 items-center md:h-10"
          >
            <Skeleton className="h-7 w-52 md:h-8 md:w-64" />
          </div>

          {/* «Email підтверджено» status line (text-sm + mb-4) */}
          <div className="mb-4 flex h-5 items-center gap-2">
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
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
      </div>
    </div>
  );
}
