import type { ReactNode } from "react";

/**
 * Layout for the auth route group — centres the auth card. Does not render a
 * second <main> element (the root layout already provides one).
 *
 * Shared by /login, /register, /forgot-password, /reset-password, /verify-email
 * and the email-change landings (TASK-396). `max-w-md` is the DS inner width
 * for auth forms (design-system §4); the card takes the card-role radius
 * (§5, owner decision 7.9) rather than the base `rounded-lg` (TASK-871).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
      <div className="rounded-card border border-border bg-card p-6 text-card-foreground">
        {children}
      </div>
    </div>
  );
}
