"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth, useAuthControllerLogin } from "@/entities/session";
import { Button, Input, Label } from "@/shared/ui";
import { dict } from "@/shared/config";

const loginSchema = z.object({
  email: z.string().email(dict.login.emailInvalid),
  password: z.string().min(1, dict.login.passwordRequired),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Extract `message` from the API error envelope
 * (`{ statusCode, error, message }`) without trusting the response shape —
 * returns "" for anything unexpected.
 */
function getErrorEnvelopeMessage(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  const message = (data as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

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
  // A 401 is either bad credentials or a deactivated (banned) account — the
  // API distinguishes them only by the error-envelope `message` ("Account is
  // deactivated"). Matching is defensive: case-insensitive contains (TASK-202).
  const isDeactivated =
    status === 401 &&
    getErrorEnvelopeMessage(login.error?.response?.data)
      .toLowerCase()
      .includes("deactivated");
  const errorMessage = notAdmin
    ? dict.login.errorNotAdmin
    : isDeactivated
      ? dict.login.errorDeactivated
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
    </form>
  );
}
