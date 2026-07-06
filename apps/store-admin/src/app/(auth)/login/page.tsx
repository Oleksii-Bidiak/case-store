import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminLoginForm } from "@/features/admin-auth";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.login.metaTitle,
  description: dict.login.metaDescription,
};

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.login.heading}
        </h1>
        <p className="text-sm text-muted-foreground">{dict.login.subtitle}</p>
      </div>

      {/* AdminLoginForm uses useSearchParams → needs a Suspense boundary. */}
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
