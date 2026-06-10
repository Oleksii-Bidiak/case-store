import type { Metadata } from "next";
import { RegisterForm } from "@/features/auth";

export const metadata: Metadata = {
  title: "Register | MobileStore",
  description: "Create a new account.",
};

export default function RegisterPage() {
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">
        Create your account
      </h1>
      <RegisterForm />
    </section>
  );
}
