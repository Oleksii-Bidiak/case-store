"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth, useAuthControllerLogout } from "@/entities/session";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * LogoutButton — signs the admin out: revokes the refresh token server-side,
 * clears the in-memory session, and returns to the login page. The local
 * session is cleared even if the network call fails, so the UI never stays in a
 * stale "signed-in" state.
 */
export function LogoutButton() {
  const router = useRouter();
  const { clearTokens } = useAuth();
  const logout = useAuthControllerLogout();

  const onClick = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        clearTokens();
        router.replace("/login");
      },
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={dict.common.signOut}
      disabled={logout.isPending}
      onClick={onClick}
    >
      <LogOut className="size-4" />
    </Button>
  );
}
