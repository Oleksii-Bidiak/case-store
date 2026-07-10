"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthControllerLogout } from "@/entities/session";
import { useUserControllerGetProfile, type UserEntity } from "@/entities/user";
import { Skeleton } from "@/shared/ui";
import { dict, STICKY_ASIDE_TOP } from "@/shared/config";
import {
  AccountIcon,
  AccountBackIcon,
  AccountLogoutIcon,
  type AccountIconName,
} from "./account-icons";
import { AccountProfileSection } from "./account-profile-section";
import { AccountBonusesSection } from "./account-bonuses-section";
import { AccountSettingsSection } from "./account-settings-section";
import { AccountPlaceholderSection } from "./account-placeholder-section";

/** Inline dashboard sections (link items — orders/favorites — route away). */
type SectionKey =
  | "profile"
  | "purchases"
  | "history"
  | "bonuses"
  | "compare"
  | "settings";

interface NavEntry {
  key: string;
  icon: AccountIconName;
  /** When set the item navigates to an existing page instead of switching. */
  href?: string;
}

const NAV: NavEntry[] = [
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
 * AccountView — the `/account` dashboard (Account.dc.html redesign). Auth-gated
 * like checkout. A sticky sidebar switches inline sections; orders + favorites
 * link to their existing pages (/orders, /wishlist). Profile reuses the real
 * ProfileForm; bonuses / settings / purchases / history / compare are stubs
 * (no backend — TASK-175).
 */
export function AccountView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isInitializing, clearTokens } = useAuth();
  const logout = useAuthControllerLogout();

  const [section, setSection] = useState<SectionKey>("profile");

  const { data, isLoading, isError } = useUserControllerGetProfile({
    query: { enabled: isAuthenticated },
  });

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace("/login?redirect=/account");
    }
  }, [isInitializing, isAuthenticated, router]);

  if (isInitializing || !isAuthenticated || isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const user = data?.data;
  const d = dict.account.dashboard;

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.email ||
    "";
  const initials =
    (
      (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "")
    ).toUpperCase() || (user?.email?.[0] ?? "?").toUpperCase();

  function handleLogout() {
    logout.mutate(undefined, {
      onSettled: () => {
        clearTokens();
        queryClient.clear();
        router.push("/");
      },
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <Link
        href="/"
        className="mb-[22px] inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <AccountBackIcon width={18} height={18} />
        {d.backHome}
      </Link>

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid items-start gap-7 lg:grid-cols-[264px_1fr]">
        {/* Sidebar */}
        <aside
          className={`rounded-[18px] border border-border bg-card p-2 shadow-card lg:sticky ${STICKY_ASIDE_TOP}`}
        >
          <div className="flex items-center gap-3 px-3 pt-3.5 pb-4">
            <span
              className="inline-flex size-[46px] shrink-0 items-center justify-center rounded-full font-display text-[17px] font-bold text-primary"
              style={{
                background:
                  "color-mix(in oklab, var(--color-primary) 14%, var(--color-card))",
              }}
            >
              {initials}
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="truncate font-display text-[14.5px] leading-tight text-foreground">
                {d.greeting(fullName)}
              </b>
              {user?.phone && (
                <span className="mt-0.5 font-mono text-[12.5px] text-muted-foreground">
                  {user.phone}
                </span>
              )}
            </span>
          </div>
          <div className="mx-1 mb-1.5 h-px bg-border" />

          <nav aria-label={d.navAria} className="flex flex-col">
            {NAV.map((entry) => {
              const label = d.nav[entry.key as keyof typeof d.nav];
              const active = !entry.href && section === entry.key;
              const className = `relative mb-0.5 flex w-full items-center gap-3 rounded-[11px] px-3.5 py-[11px] text-left text-[14.5px] no-underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "font-semibold text-primary"
                  : "font-medium text-foreground hover:bg-muted"
              }`;
              const style = active
                ? {
                    background:
                      "color-mix(in oklab, var(--color-primary) 10%, var(--color-card))",
                  }
                : undefined;
              const inner = (
                <>
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute top-[9px] bottom-[9px] left-0 w-[3px] rounded-full bg-primary"
                    />
                  )}
                  <AccountIcon
                    name={entry.icon}
                    width={20}
                    height={20}
                    className={
                      active ? "text-primary" : "text-muted-foreground"
                    }
                  />
                  <span className="flex-1">{label}</span>
                </>
              );

              return entry.href ? (
                <Link key={entry.key} href={entry.href} className={className}>
                  {inner}
                </Link>
              ) : (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setSection(entry.key as SectionKey)}
                  aria-current={active ? "page" : undefined}
                  className={className}
                  style={style}
                >
                  {inner}
                </button>
              );
            })}
          </nav>

          <div className="mx-1 my-1.5 h-px bg-border" />
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="flex w-full items-center gap-3 rounded-[11px] px-3.5 py-[11px] text-left text-[14.5px] font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <AccountLogoutIcon width={20} height={20} />
            {d.logout}
          </button>
        </aside>

        {/* Content */}
        <section className="min-w-0">
          {isError || !user ? (
            <p role="alert" className="text-sm text-destructive">
              {dict.account.loadError}
            </p>
          ) : (
            <AccountContent section={section} user={user} />
          )}
        </section>
      </div>
    </div>
  );
}

function AccountContent({
  section,
  user,
}: {
  section: SectionKey;
  user: UserEntity;
}) {
  const d = dict.account.dashboard;
  switch (section) {
    case "profile":
      return <AccountProfileSection user={user} />;
    case "bonuses":
      return <AccountBonusesSection />;
    case "settings":
      return <AccountSettingsSection />;
    case "purchases":
      return (
        <AccountPlaceholderSection
          title={d.nav.purchases}
          body={d.purchasesBody}
          ctaLabel={d.purchasesCta}
          ctaHref="/orders"
        />
      );
    case "history":
      return (
        <AccountPlaceholderSection
          title={d.nav.history}
          body={d.historyBody}
          ctaLabel={d.historyCta}
          ctaHref="/"
        />
      );
    case "compare":
      return (
        <AccountPlaceholderSection
          title={d.nav.compare}
          body={d.compareBody}
          ctaLabel={d.compareCta}
          ctaHref="/products"
        />
      );
  }
}
