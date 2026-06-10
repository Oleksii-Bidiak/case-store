"use client";

import Link from "next/link";
import { useAuth } from "@/entities/session";
import { LogoutButton } from "@/features/auth";
import { Skeleton } from "@/shared/ui";

/**
 * HeaderAuth — auth state area for the site header. Shows a skeleton while the
 * session is restoring, sign-in/register links for guests, and an account
 * label + sign-out for authenticated users.
 */
export function HeaderAuth() {
  const { isInitializing, isAuthenticated } = useAuth();

  if (isInitializing) {
    return <Skeleton className="h-8 w-32" />;
  }

  if (!isAuthenticated) {
    return (
      <nav className="flex items-center gap-4 text-sm" aria-label="Account">
        <Link
          href="/login"
          className="text-foreground hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Register
        </Link>
      </nav>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">My account</span>
      <LogoutButton />
    </div>
  );
}
