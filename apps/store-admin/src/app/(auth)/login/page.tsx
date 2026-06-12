import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminLoginForm } from "@/features/admin-auth";

export const metadata: Metadata = {
  title: "Sign in — Admin Panel",
  description: "Sign in to the Mobile Accessories Store admin panel.",
};

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to manage your store
        </p>
      </div>

      {/* AdminLoginForm uses useSearchParams → needs a Suspense boundary. */}
      <Suspense>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}
