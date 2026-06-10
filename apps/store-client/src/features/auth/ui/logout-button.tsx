"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, useAuthControllerLogout } from "@/entities/session";

/** LogoutButton — ends the session (best-effort server logout). */
export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { clearTokens } = useAuth();

  const logout = useAuthControllerLogout();

  const finish = () => {
    clearTokens();
    queryClient.clear();
    router.push("/");
  };

  const handleClick = () => {
    logout.mutate(undefined, {
      // Clear local session whether or not the server call succeeds.
      onSettled: finish,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={logout.isPending}
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {logout.isPending ? "Signing out…" : "Sign out"}
    </button>
  );
}
