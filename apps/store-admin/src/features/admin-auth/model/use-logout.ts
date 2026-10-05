"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useAuthControllerLogout } from "@/entities/session";

/**
 * Sign the staff member out: revoke the refresh token server-side, clear the
 * in-memory session, and return to the login page. The local session is cleared
 * even if the network call fails, so the UI never stays in a stale "signed-in"
 * state.
 *
 * A hook (wave 198) because there are now two doors to the same action — the
 * header's icon button and «Вийти» in the account menu — and two copies of
 * "clear, then navigate" is how one of them eventually forgets a step.
 */
export function useLogout(): { logout: () => void; isPending: boolean } {
  const router = useRouter();
  const { clearTokens } = useAuth();
  const { mutate, isPending } = useAuthControllerLogout();

  const logout = useCallback(() => {
    mutate(undefined, {
      onSettled: () => {
        clearTokens();
        router.replace("/login");
      },
    });
  }, [mutate, clearTokens, router]);

  return { logout, isPending };
}
