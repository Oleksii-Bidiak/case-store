"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth, useAuthControllerLogin } from "@/entities/session";
import {
  Button,
  Callout,
  FieldError,
  FormAlert,
  Input,
  Label,
} from "@/shared/ui";
import { dict, STOREFRONT_URL } from "@/shared/config";
import { loginRedirectTarget } from "../lib/sanitize-redirect-target";

const loginSchema = z.object({
  email: z.string().email(dict.login.emailInvalid),
  password: z.string().min(1, dict.login.passwordRequired),
});

type LoginValues = z.infer<typeof loginSchema>;

const EMAIL_ERROR_ID = "login-email-error";
const PASSWORD_ERROR_ID = "login-password-error";

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
 * Roles allowed into the admin panel (TASK-334). Kept in step with
 * `STAFF_ROLES` in `entities/session/model/auth.context.tsx` — the provider
 * enforces the same rule, this check only produces the friendlier message.
 */
const STAFF_ROLES: ReadonlySet<string> = new Set(["ADMIN", "MANAGER"]);

/**
 * AdminLoginForm — email/password sign-in for the admin panel.
 *
 * On success it verifies the account is STAFF (ADMIN or MANAGER) before
 * establishing the session; a valid CUSTOMER login is rejected with a clear
 * message rather than silently failing.
 *
 * Wave 198 (Login artboard П1–П4):
 *  - field canon (TASK-1036): an invalid field carries `aria-invalid` (red
 *    border + ring from `Input`) and names its reason with `aria-describedby`;
 *    no asterisks — both fields are required and the form has nothing else;
 *  - the server's refusal is ONE `FormAlert` block above the button, not a red
 *    line that reads like a third field error;
 *  - `?reason=session` (from «Сесія закінчилась») explains the visit, with the
 *    email of the session that ended already filled in;
 *  - `?next=` is honoured, sanitized (TASK-974);
 *  - `method="post"` (TASK-1210): a submit that lands before hydration is a
 *    native one, and without a method it was a GET that put the password in the
 *    address bar, the history and every proxy log on the way.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isStaff, setTokens, expiredSessionEmail } = useAuth();
  const [notAdmin, setNotAdmin] = useState(false);

  // Honour a same-origin `?next=` (or the older `?redirect=`); default to the
  // dashboard. A bare leading-slash check let `//evil.com` and `/%09/evil.com`
  // through (TASK-527) — the sanitizer is the storefront's, copied with its
  // case table.
  const redirectTarget = loginRedirectTarget(searchParams);
  const cameFromExpiredSession = searchParams.get("reason") === "session";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    // Not async-seeded: the email of the session that just ended is already in
    // the provider when this form mounts (forms.md rule 1 does not apply).
    defaultValues: { email: expiredSessionEmail ?? "", password: "" },
  });

  const login = useAuthControllerLogin();

  // Already an authenticated staff member → leave the login page.
  useEffect(() => {
    if (isStaff) {
      router.replace(redirectTarget);
    }
  }, [isStaff, router, redirectTarget]);

  const onSubmit = (values: LoginValues) => {
    setNotAdmin(false);
    login.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          const token = res?.data?.accessToken;
          if (!token) return;

          const tokenRole = decodeRole(token);
          if (tokenRole === null || !STAFF_ROLES.has(tokenRole)) {
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
      method="post"
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      {cameFromExpiredSession && (
        <Callout variant="muted" role="status">
          {dict.login.sessionExpired}
        </Callout>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-email">{dict.login.email}</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? EMAIL_ERROR_ID : undefined}
          {...register("email")}
        />
        <FieldError id={EMAIL_ERROR_ID}>{errors.email?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="login-password">{dict.login.password}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? PASSWORD_ERROR_ID : undefined}
          {...register("password")}
        />
        <FieldError id={PASSWORD_ERROR_ID}>
          {errors.password?.message}
        </FieldError>
      </div>

      <FormAlert>{errorMessage}</FormAlert>

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
