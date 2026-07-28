import { Suspense } from "react";
import type { Metadata } from "next";
import { VerifyEmailConfirm } from "@/features/auth";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.verifyEmailTitle,
  description: dict.meta.verifyEmailDescription,
  // A single-use token in the URL: keep this page out of search indexes.
  robots: { index: false, follow: false },
};

/**
 * `/verify-email?token=…` — the destination of the link in the verification
 * email (TASK-342). The API builds this URL as
 * `${STORE_CLIENT_URL}/verify-email?token=<raw>`; renaming the route means
 * changing `EmailVerificationService` too.
 */
export default function VerifyEmailPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {dict.auth.verifyEmail.heading}
      </h1>
      {/* VerifyEmailConfirm reads useSearchParams() — needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <VerifyEmailConfirm />
      </Suspense>
    </section>
  );
}
