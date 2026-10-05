"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/entities/session";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@/shared/ui";
import { dict } from "@/shared/config";

/**
 * Where «Увійти знову» goes: /login, told why (`reason=session` → the callout
 * on the form) and where to come back to (`next`, sanitized on the way back in
 * by the login form, TASK-974). Read from `window.location` at click time — the
 * query string is part of "the same page" (a filtered order list), and reading
 * it here keeps `useSearchParams` and its Suspense boundary out of the layout.
 */
export function sessionExpiredLoginHref(): string {
  const params = new URLSearchParams({ reason: "session" });
  const here = `${window.location.pathname}${window.location.search}`;
  if (here !== "/") {
    params.set("next", here);
  }
  return `/login?${params.toString()}`;
}

/**
 * «Сесія закінчилась» (TASK-528 + TASK-974, AdminShell П7).
 *
 * Shown when the session ended while the person was working — a request
 * answered 401 and so did its refresh. Before, nothing said so: tables failed in
 * place, the panel kept looking signed in, and the next click went nowhere. The
 * dialog is deliberately NOT dismissable (no Cancel, Escape and outside clicks
 * are swallowed): behind it is a panel whose every request will 401, and the
 * only useful thing left is to sign in again — which brings them back here.
 *
 * The plain guard redirect stays for a browser that was never signed in.
 */
export function SessionExpiredDialog() {
  const router = useRouter();
  const { isSessionExpired, clearTokens } = useAuth();

  const signInAgain = () => {
    // Navigate first, then drop the dead session: `isSessionExpired` survives
    // `clearTokens`, so the shell guard does not race this with a bare /login.
    router.replace(sessionExpiredLoginHref());
    clearTokens();
  };

  return (
    <AlertDialog open={Boolean(isSessionExpired)}>
      <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{dict.header.sessionExpiredTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {dict.header.sessionExpiredBody}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button type="button" onClick={signInAgain}>
            <LogIn aria-hidden="true" />
            {dict.header.sessionExpiredAction}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
