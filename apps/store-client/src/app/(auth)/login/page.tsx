import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Sign In | MobileStore",
  description: "Sign in to your account.",
};

export default function LoginPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Sign in</h1>
      {/* LoginForm reads useSearchParams() — needs a Suspense boundary for SSR. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </section>
  );
}
