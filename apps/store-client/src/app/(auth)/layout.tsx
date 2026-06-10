import type { ReactNode } from "react";

/**
 * Layout for the auth route group — centres the auth card. Does not render a
 * second <main> element (the root layout already provides one).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-12">
      <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
        {children}
      </div>
    </div>
  );
}
