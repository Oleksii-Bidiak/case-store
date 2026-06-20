import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/features/auth";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.loginTitle,
  description: dict.meta.loginDescription,
};

export default function LoginPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {dict.auth.login.heading}
      </h1>
      {/* LoginForm reads useSearchParams() — needs a Suspense boundary for SSR. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </section>
  );
}
