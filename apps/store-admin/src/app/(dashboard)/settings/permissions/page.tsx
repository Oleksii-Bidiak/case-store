import type { Metadata } from "next";
import { PermissionMatrixView } from "@/widgets";
import { CreateStaffButton } from "@/features/user-create";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.permissionsMatrix.metaTitle,
};

export default function PermissionsPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* TASK-406: the same «Створити співробітника» CTA as on /users. This is
          the screen the owner opens to decide what a manager may do, and the
          next thing they want is to hand someone the account — sending them off
          to another page to find the button is how the whole RBAC zone went
          unchecked on the live run. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {dict.permissionsMatrix.heading}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {dict.permissionsMatrix.intro}
          </p>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {dict.permissionsMatrix.createStaffHint}
          </p>
        </div>
        <CreateStaffButton />
      </div>

      <PermissionMatrixView />
    </div>
  );
}
