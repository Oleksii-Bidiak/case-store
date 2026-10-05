"use client";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/entities/session";
import { useUserControllerGetProfile, type UserEntity } from "@/entities/user";
import { dict, FEATURE_STUBS } from "@/shared/config";
import {
  ACCOUNT_ORDERS_PATH,
  parseAccountSection,
  type AccountSectionKey,
} from "./account-nav";
import { AccountProfileSkeleton } from "./account-skeleton";
import { AccountProfileSection } from "./account-profile-section";
import { AccountBonusesSection } from "./account-bonuses-section";
import { AccountSettingsSection } from "./account-settings-section";
import { AccountPlaceholderSection } from "./account-placeholder-section";

/**
 * AccountView — the content column of `/account` (Account.dc.html). The frame
 * around it — back link, menu, chip strip, auth guard — is AccountShell, from
 * `app/account/layout.tsx`, shared with the order routes.
 *
 * The section comes from `?section=` (TASK-867), so a reload, a shared link
 * and Back keep it; anything unknown is the profile. Profile reuses the real
 * ProfileForm; bonuses / settings / purchases / history / compare are stubs
 * (no backend — TASK-175). Reads `useSearchParams`, so the page renders it
 * inside `<Suspense>`.
 */
export function AccountView() {
  const searchParams = useSearchParams();
  const section = parseAccountSection(searchParams.get("section"));
  const { isAuthenticated } = useAuth();

  // The shell has already loaded this query before mounting the page, so this
  // is a cache read; the skeleton branch covers a render outside the shell.
  const { data, isLoading, isError } = useUserControllerGetProfile({
    query: { enabled: isAuthenticated },
  });

  if (isLoading) return <AccountProfileSkeleton />;

  const user = data?.data;
  if (isError || !user) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.account.loadError}
      </p>
    );
  }

  return <AccountContent section={section} user={user} />;
}

function AccountContent({
  section,
  user,
}: {
  section: AccountSectionKey;
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
          ctaHref={ACCOUNT_ORDERS_PATH}
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
      // parseAccountSection already maps `compare` to the profile while the
      // entry is hidden; the gate stays so the placeholder cannot surface by
      // any other route.
      return FEATURE_STUBS ? (
        <AccountPlaceholderSection
          title={d.nav.compare}
          body={d.compareBody}
          ctaLabel={d.compareCta}
          ctaHref="/products"
        />
      ) : null;
  }
}
