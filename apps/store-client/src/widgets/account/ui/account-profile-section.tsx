"use client";

import { useState } from "react";
import { type UserEntity } from "@/entities/user";
import { ChangePasswordForm } from "@/features/auth";
import { ProfileForm } from "@/features/profile";
import { dict } from "@/shared/config";
import { Button } from "@/shared/ui";
import { AccountEmailVerification } from "./account-email-verification";

/**
 * AccountProfileSection — the "Особисті дані" dashboard section. Reuses the real
 * ProfileForm (name / phone; email read-only, PUT /api/users/me) inside the
 * design's contact card, plus email-verification state (TASK-342) and a
 * "Безпека" card holding the real change-password form (TASK-333 — this was a
 * "coming soon" toast until `POST /api/auth/password/change` shipped).
 */
export function AccountProfileSection({ user }: { user: UserEntity }) {
  const d = dict.account.dashboard;
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  return (
    <div className="max-w-[680px]">
      <h1 className="mb-6 font-display text-[28px] font-bold tracking-[-0.02em] text-foreground">
        {d.profileHeading}
      </h1>

      <AccountEmailVerification user={user} />

      <div className="rounded-[18px] border border-border bg-card p-[26px] shadow-card">
        <h2 className="mb-[18px] text-[17px] font-semibold text-foreground">
          {d.contactHeading}
        </h2>
        <ProfileForm user={user} />
      </div>

      <div className="mt-[18px] rounded-[18px] border border-border bg-card p-[26px] shadow-card">
        <h2 className="mb-1.5 text-[17px] font-semibold text-foreground">
          {d.securityHeading}
        </h2>
        <p className="text-[13.5px] text-muted-foreground">{d.securityNote}</p>

        {isChangingPassword ? (
          <ChangePasswordForm onCancel={() => setIsChangingPassword(false)} />
        ) : (
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setIsChangingPassword(true)}
          >
            {d.changePassword}
          </Button>
        )}
      </div>
    </div>
  );
}
