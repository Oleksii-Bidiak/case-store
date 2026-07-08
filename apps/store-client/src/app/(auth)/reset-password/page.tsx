import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.resetPasswordTitle,
  description: dict.meta.resetPasswordDescription,
};

export default function ResetPasswordPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {dict.auth.resetPassword.heading}
      </h1>
      {/* ResetPasswordForm reads useSearchParams() — needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </section>
  );
}
