"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCartQueryKey } from "@/entities/cart";
import { useAuth, useConfirmAccountSetup } from "@/entities/session";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { apiErrorStatus } from "@/shared/lib";
// Direct import (not the barrel) — the shared/lib barrel pulls in the JSON-LD
// schema builders, which this client form does not need.
import { customerPasswordSchema } from "@/shared/lib/password-policy";
import { Button } from "@/shared/ui";
import { AUTH_LINK_CLASS, AUTH_SUBMIT_CLASS, AuthField } from "./auth-field";

const setupSchema = z
  .object({
    // The shopper policy, exactly as on /register (TASK-407).
    password: customerPasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: dict.auth.register.validationPasswordMatch,
    path: ["passwordConfirm"],
  });

type SetupValues = z.infer<typeof setupSchema>;

/** The cabinet, carrying the claimed-order count for its banner (TASK-485). */
function accountHref(claimed: number): string {
  return claimed > 0 ? `/account?claimed=${claimed}` : "/account";
}

/**
 * AccountSetupForm — `/account-setup?token=…`, the «Задайте пароль» letter of
 * an account created at checkout (TASK-2010, B-12 тема 2 (а)).
 *
 * Two ways out, and BOTH confirm: the link itself proves the address, so the
 * server marks it verified and moves this address's guest orders into the
 * account (TASK-485) whichever button is pressed.
 *
 *   - «Зберегти пароль» — `password` set under the same shopper policy as the
 *     registration form.
 *   - «Пропустити» — no `password` in the body. The account stays password-less;
 *     «Забули пароль?» sets one later.
 *
 * The answer is a session on this device (refresh cookie + access token), so
 * the shopper lands in the cabinet already signed in — with «Приєднано N
 * замовлень» when guest orders came along (the `?claimed=` banner).
 *
 * A dead link (400 ACCOUNT_SETUP_INVALID — used, expired, unknown; one answer
 * for all of them on purpose) points at /forgot-password: a reset letter does
 * the same job for an account without a password.
 */
export function AccountSetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { setTokens } = useAuth();
  const token = searchParams.get("token");

  const confirm = useConfirmAccountSetup({
    mutation: {
      onSuccess: (response) => {
        const data = response?.data;
        if (!data?.accessToken) return;
        setTokens(data.accessToken);
        void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        void queryClient.invalidateQueries({
          queryKey: getGetWishlistQueryKey(),
        });
        router.replace(accountHref(data.claimedOrders ?? 0));
      },
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: { password: "", passwordConfirm: "" },
  });

  const d = dict.auth.accountSetup;

  if (!token) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {d.errorMissingToken}
      </p>
    );
  }

  const onSubmit = (values: SetupValues) =>
    confirm.mutate({ data: { token, password: values.password } });
  const onSkip = () => confirm.mutate({ data: { token } });

  const status = apiErrorStatus(confirm.error);
  const linkDead = confirm.isError && status === 400;
  const errorMessage = !confirm.isError
    ? null
    : linkDead
      ? d.errorInvalid
      : status === 429
        ? d.errorTooMany
        : dict.common.genericError;
  // Leaving: the session is stored and the cabinet is on its way.
  const busy = confirm.isPending || confirm.isSuccess;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      noValidate
    >
      <p className="text-sm text-muted-foreground">{d.intro}</p>

      <AuthField
        id="account-setup-password"
        label={d.password}
        type="password"
        autoComplete="new-password"
        error={errors.password?.message}
        hint={dict.auth.register.passwordHint}
        {...register("password")}
      />

      <AuthField
        id="account-setup-password-confirm"
        label={d.confirmPassword}
        type="password"
        autoComplete="new-password"
        error={errors.passwordConfirm?.message}
        {...register("passwordConfirm")}
      />

      {errorMessage && (
        <div className="flex flex-col gap-1">
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
          {linkDead && (
            <p className="text-sm text-muted-foreground">
              {d.errorNextStep}{" "}
              <Link href="/forgot-password" className={AUTH_LINK_CLASS}>
                {d.toForgotPassword}
              </Link>
            </p>
          )}
        </div>
      )}

      <Button type="submit" disabled={busy} className={AUTH_SUBMIT_CLASS}>
        {confirm.isPending ? d.submitting : d.submit}
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={onSkip}
        disabled={busy}
        className={AUTH_SUBMIT_CLASS}
      >
        {d.skip}
      </Button>
    </form>
  );
}
