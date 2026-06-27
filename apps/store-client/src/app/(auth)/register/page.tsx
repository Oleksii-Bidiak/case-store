import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.registerTitle,
  description: dict.meta.registerDescription,
};

export default function RegisterPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        {dict.auth.register.heading}
      </h1>
      {/* RegisterForm reads useSearchParams() — needs a Suspense boundary for SSR. */}
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </section>
  );
}
