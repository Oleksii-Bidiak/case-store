"use client";

import { Suspense, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";

type Tab = "login" | "register";

interface AuthSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * AuthSheet — the right-side "Особистий кабінет" slide-out that hosts the sign-in
 * and registration forms behind two tabs (matches the design import). Reuses the
 * existing `LoginForm` / `RegisterForm` (and their real mutations) in slide-out
 * mode: on success they call `onAuthenticated` to close the sheet instead of
 * navigating, so the header re-renders in place.
 *
 * Controlled by the header's guest "Кабінет" trigger.
 */
export function AuthSheet({ open, onOpenChange }: AuthSheetProps) {
  const [tab, setTab] = useState<Tab>("login");
  const close = () => onOpenChange(false);

  const tabClass = (active: boolean) =>
    cn(
      "h-11 flex-1 cursor-pointer rounded-lg text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]",
      active
        ? "bg-primary text-primary-foreground shadow-[var(--shadow-card)]"
        : "bg-muted text-foreground hover:bg-accent",
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-display text-lg font-bold text-foreground">
            {dict.auth.sheet.title}
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-1.5 px-5 pt-4">
          <button
            type="button"
            onClick={() => setTab("login")}
            className={tabClass(tab === "login")}
          >
            {dict.auth.sheet.tabLogin}
          </button>
          <button
            type="button"
            onClick={() => setTab("register")}
            className={tabClass(tab === "register")}
          >
            {dict.auth.sheet.tabRegister}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* LoginForm/RegisterForm read useSearchParams() — guard with Suspense.
              Keyed by tab so switching fades/slides the new form in. */}
          <Suspense fallback={null}>
            <div
              key={tab}
              className="duration-200 animate-in fade-in-0 slide-in-from-right-2"
            >
              {tab === "login" ? (
                <LoginForm
                  onAuthenticated={close}
                  onSwitchToRegister={() => setTab("register")}
                />
              ) : (
                <RegisterForm
                  onAuthenticated={close}
                  onSwitchToLogin={() => setTab("login")}
                />
              )}
            </div>
          </Suspense>
        </div>
      </SheetContent>
    </Sheet>
  );
}
