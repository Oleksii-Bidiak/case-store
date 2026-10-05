import { Suspense } from "react";
import type { Metadata } from "next";
import { RevertEmailChange } from "@/features/change-email";
import { dict, H1_CLASS } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.revertEmailChangeTitle,
  description: dict.meta.revertEmailChangeDescription,
  // A single-use token in the URL: keep this page out of search indexes.
  robots: { index: false, follow: false },
};

/**
 * `/revert-email-change?token=…` — the "this wasn't me" link in the warning sent
 * to the OLD address (TASK-396). Built by `EmailChangeService` as
 * `${STORE_CLIENT_URL}/revert-email-change?token=<raw>`.
 */
export default function RevertEmailChangePage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className={`${H1_CLASS} text-foreground`}>
        {dict.auth.revertEmailChange.heading}
      </h1>
      <Suspense fallback={null}>
        <RevertEmailChange />
      </Suspense>
    </section>
  );
}
