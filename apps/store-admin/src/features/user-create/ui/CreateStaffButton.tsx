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
 * Owner-gated here rather than at every call site: creating staff is
 * `@OwnerOnly()` on the API, and a button that answers 403 is worse than no
 * button. Renders nothing for a manager.
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
