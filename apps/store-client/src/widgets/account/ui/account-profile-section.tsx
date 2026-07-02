"use client";

import { toast } from "sonner";
import { type UserEntity } from "@/entities/user";
import { ProfileForm } from "@/features/profile";
import { dict } from "@/shared/config";
import { Button } from "@/shared/ui";

/**
 * AccountProfileSection — the "Особисті дані" dashboard section. Reuses the real
 * ProfileForm (name / phone; email read-only, PUT /api/users/me) inside the
 * design's contact card, plus a "Безпека" card whose change-password action is a
 * stub (toast) until the reset flow ships (TASK-169).
 */
export function AccountProfileSection({ user }: { user: UserEntity }) {
  const d = dict.account.dashboard;

  return (
    <div className="max-w-[680px]">
      <h1 className="mb-6 font-display text-[28px] font-bold tracking-[-0.02em] text-foreground">
        {d.profileHeading}
      </h1>

      <div className="rounded-[18px] border border-border bg-card p-[26px] shadow-[var(--shadow-card)]">
        <h2 className="mb-[18px] text-[17px] font-semibold text-foreground">
          {d.contactHeading}
        </h2>
        <ProfileForm user={user} />
      </div>

      <div className="mt-[18px] rounded-[18px] border border-border bg-card p-[26px] shadow-[var(--shadow-card)]">
        <h2 className="mb-1.5 text-[17px] font-semibold text-foreground">
          {d.securityHeading}
        </h2>
        <p className="mb-4 text-[13.5px] text-muted-foreground">
          {d.securityNote}
        </p>
        <Button variant="outline" onClick={() => toast(d.changePasswordStub)}>
          {d.changePassword}
        </Button>
      </div>
    </div>
  );
}
