"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/entities/session";
import { useUserControllerGetProfile } from "@/entities/user";
import { ProfileForm } from "@/features/profile";
import { LogoutButton } from "@/features/auth";
import { Skeleton, Separator } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * AccountView — client orchestrator for `/account`. Auth-gated like checkout:
 * shows a skeleton while the session restores, redirects guests to login, then
 * renders the profile edit form plus a link to order history and a sign-out.
 */
export function AccountView() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          {dict.account.title}
        </h1>
        <LogoutButton />
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-6 shadow-card">
        <h2 className="text-lg font-semibold text-foreground">
          {dict.account.profileHeading}
        </h2>
        {isError || !user ? (
          <p role="alert" className="text-sm text-destructive">
            {dict.account.loadError}
          </p>
        ) : (
          <ProfileForm user={user} />
        )}
      </section>

      <Separator />

      <Link
        href="/orders"
        className="flex items-center justify-between rounded-xl border border-border p-6 shadow-card transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-col">
          <span className="font-semibold text-foreground">
            {dict.account.ordersLink}
          </span>
          <span className="text-sm text-muted-foreground">
            {dict.account.ordersLinkDesc}
          </span>
        </span>
        <span aria-hidden className="text-muted-foreground">
          →
        </span>
      </Link>
    </div>
  );
}
