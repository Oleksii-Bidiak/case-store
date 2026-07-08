import { Suspense } from "react";
import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.forgotPasswordTitle,
  description: dict.meta.forgotPasswordDescription,
};

export default function ForgotPasswordPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {dict.auth.forgotPassword.heading}
      </h1>
      {/* ForgotPasswordForm has no useSearchParams(), but keep the Suspense shell
          consistent with the other auth pages. */}
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </section>
  );
}
