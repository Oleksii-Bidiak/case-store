"use client";

import { LogOut } from "lucide-react";
import { Button, LabelTooltip } from "@/shared/ui";
import { dict } from "@/shared/config";
import { useLogout } from "../model/use-logout";

/**
 * LogoutButton — the header's icon-only sign-out. The behaviour lives in
 * {@link useLogout}, shared with «Вийти» in the account menu (wave 198).
 */
export function LogoutButton() {
  const { logout, isPending } = useLogout();

  return (
    <LabelTooltip label={dict.common.signOut}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={dict.common.signOut}
        disabled={isPending}
        onClick={logout}
      >
        <LogOut className="size-4" aria-hidden="true" />
      </Button>
    </LabelTooltip>
  );
}
