import { Suspense } from "react";
import type { Metadata } from "next";
import { AccountSetupForm } from "@/features/auth";
import { dict, H1_CLASS } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.accountSetupTitle,
  description: dict.meta.accountSetupDescription,
  // A single-use token in the URL: keep this page out of search indexes.
  robots: { index: false, follow: false },
};

/**
 * `/account-setup?token=…` — the «Задайте пароль» letter sent when an account
 * is created at checkout or with one click after a guest order (TASK-2010). The
 * API builds this URL from `STORE_CLIENT_URL`; renaming the route means
 * changing the letter too.
 */
export default function AccountSetupPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className={`${H1_CLASS} text-foreground`}>
        {dict.auth.accountSetup.heading}
      </h1>
      {/* AccountSetupForm reads useSearchParams() — needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <AccountSetupForm />
      </Suspense>
    </section>
  );
}
