import { Suspense } from "react";
import type { Metadata } from "next";
import { ConfirmEmailChange } from "@/features/change-email";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.confirmEmailChangeTitle,
  description: dict.meta.confirmEmailChangeDescription,
  // A single-use token in the URL: keep this page out of search indexes.
  robots: { index: false, follow: false },
};

/**
 * `/confirm-email-change?token=…` — the link in the letter to the NEW address
 * (TASK-396). The API builds it as
 * `${STORE_CLIENT_URL}/confirm-email-change?token=<raw>`; renaming the route
 * means changing `EmailChangeService` too.
 */
export default function ConfirmEmailChangePage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {dict.auth.confirmEmailChange.heading}
      </h1>
      {/* Reads useSearchParams() — needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <ConfirmEmailChange />
      </Suspense>
    </section>
  );
}
