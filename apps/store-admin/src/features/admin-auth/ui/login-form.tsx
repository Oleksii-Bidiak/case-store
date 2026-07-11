"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth, useAuthControllerLogin } from "@/entities/session";
import { Button, Input, Label } from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";

const loginSchema = z.object({
  email: z.string().email(dict.login.emailInvalid),
  password: z.string().min(1, dict.login.passwordRequired),
});

type LoginValues = z.infer<typeof loginSchema>;

/** Decode a JWT payload to read the role claim (informational only). */
function decodeRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(normalized)) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

/**
 * AdminLoginForm — email/password sign-in for the admin panel.
 *
 * On success it verifies the account is an ADMIN before establishing the
 * session; a valid CUSTOMER login is rejected with a clear message rather than
 * silently failing.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAdmin, setTokens } = useAuth();
  const [notAdmin, setNotAdmin] = useState(false);

  // Honour a same-origin `?redirect=` param (leading-slash check blocks
  // open-redirects); default to the dashboard.
  const redirectParam = searchParams.get("redirect");
  const redirectTarget =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const login = useAuthControllerLogin();

  // Already an authenticated admin → leave the login page.
  useEffect(() => {
    if (isAdmin) {
      router.replace(redirectTarget);
    }
  }, [isAdmin, router, redirectTarget]);

  const onSubmit = (values: LoginValues) => {
    setNotAdmin(false);
    login.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          const token = res?.data?.accessToken;
          if (!token) return;

          if (decodeRole(token) !== "ADMIN") {
            setNotAdmin(true);
            return;
          }

          setTokens(token);
          router.push(redirectTarget);
        },
      },
    );
  };

  const status = login.error?.response?.status;
  // Every 401 is the same generic "Invalid credentials" — the API deliberately
  // does not distinguish unknown email / wrong password / deactivated account
  // (TASK-274), so there is nothing here to branch on. A deactivated owner is
  // told the truth by email instead (TASK-287); everyone sees the support link
  // below the form.
  const errorMessage = notAdmin
    ? dict.login.errorNotAdmin
    : status === 401
      ? dict.login.errorInvalid
      : login.isError
        ? dict.login.errorGeneric
        : null;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">{dict.login.email}</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">{dict.login.password}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? dict.login.signingIn : dict.login.signIn}
      </Button>

      {/* Always visible, for everyone (TASK-287). The API can no longer tell a
          user that their account is deactivated, so the form must always offer a
          human route out. The admin app has no contact page of its own — link to
          the storefront's existing one. */}
      <p className="text-center text-sm text-muted-foreground">
        {dict.authSupport.loginTrouble}{" "}
        <a
          href={`${STOREFRONT_URL}/contact`}
          className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.authSupport.contactLink}
        </a>
      </p>
    </form>
  );
}
