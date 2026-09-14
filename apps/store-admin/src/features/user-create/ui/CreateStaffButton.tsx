"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/entities/session";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { CreateUserDialog } from "./CreateUserDialog";

interface CreateStaffButtonProps {
  /** Visual weight. Default `"default"` — it is the primary action of its screen. */
  variant?: "default" | "outline";
  size?: "default" | "sm";
}

/**
 * The one CTA that opens «Новий співробітник» (TASK-406).
 *
 * The dialog existed since TASK-333, but its only trigger lived in the user
 * table's toolbar, to the right of the search box and the two filter selects.
 * On the 2026-08-27 live run the owner concluded a manager could not be created
 * at all and the whole AD-RBAC zone went unchecked — 25 checks blocked by a
 * button nobody found. So the trigger is a component now, and it is rendered in
 * the places the owner actually looks: the `/users` page heading, the «Права
 * доступу» heading (where you go to decide what a manager may do), and the
 * empty state of a filtered-to-nobody list.
 *
 * Owner-gated here rather than at every call site: a button that answers 403 is
 * worse than no button. Renders nothing for a manager.
 *
 * SINCE TASK-476 THIS GATE IS NARROWER THAN THE API. `POST /api/admin/staff` is
 * `staff:write` now, so a deputy admin may hire a MANAGER — they just cannot
 * appoint another ADMIN. Widening the gate correctly means hiding the ADMIN
 * option from a deputy rather than only the button, and that belongs with the
 * `/staff` section and its «призначення адміна» dialog (TASK-480). Narrow is the
 * safe direction to be wrong in meanwhile: nobody gains a control they will be
 * refused.
 */
export function CreateStaffButton({
  variant = "default",
  size = "default",
}: CreateStaffButtonProps = {}) {
  const { isOwner } = useAuth();
  const [open, setOpen] = useState(false);

  if (!isOwner) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => setOpen(true)}
      >
        <UserPlus aria-hidden="true" />
        {dict.users.create}
      </Button>
      <CreateUserDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
