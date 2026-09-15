"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { CreateStaffWizard } from "./CreateStaffWizard";

interface CreateStaffButtonProps {
  /** Visual weight. Default `"default"` — it is the primary action of its screen. */
  variant?: "default" | "outline";
  size?: "default" | "sm";
}

/**
 * The one CTA that opens «Новий співробітник».
 *
 * GATED ON `staff:write`, NOT ON `isOwner` (TASK-480). The button was owner-only
 * from TASK-406 until now, which was NARROWER than the API it fronts: since
 * TASK-476 `POST /api/admin/staff` is `staff:write`, so a deputy admin may hire a
 * manager — they simply may not appoint another administrator. The old gate
 * meant a deputy left in charge while the owner was away could not replace a
 * manager who quit, which is most of what a deputy is for.
 *
 * Widening the gate was only safe together with the wizard's other half: the
 * ADMIN level is now ABSENT from the form for anybody but the owner, rather than
 * offered and refused with a 403. A visible control that can only fail is the
 * thing the narrow gate was avoiding; hiding the one unusable option is the
 * cheaper fix and matches `assertMayAssign` exactly.
 *
 * `staff:write` is non-grantable, so in practice this renders for the owner and
 * their deputies and for nobody else — but it renders because of the permission
 * the server checks, not because of a rule restated here.
 */
export function CreateStaffButton({
  variant = "default",
  size = "default",
}: CreateStaffButtonProps = {}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  if (!can(PERM.staffWrite)) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
      >
        <UserPlus aria-hidden="true" />
        {dict.staff.create}
      </Button>
      <CreateStaffWizard open={open} onOpenChange={setOpen} />
    </>
  );
}
