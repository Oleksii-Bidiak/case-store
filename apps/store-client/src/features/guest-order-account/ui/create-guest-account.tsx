"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { getGetCartQueryKey } from "@/entities/cart";
import { useCreateGuestOrderAccount } from "@/entities/order";
import { useAuth } from "@/entities/session";
import { getGetWishlistQueryKey } from "@/entities/wishlist";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import { Button } from "@/shared/ui";

interface CreateGuestAccountProps {
  /** The guest order's access token — the proof the order is theirs. */
  token: string;
  /** The order's id: where the new account lands. */
  orderId: string;
  /** The order's address — the account is created on it. */
  email: string;
  /** Where «Увійти» returns to after a 409 (the page this sits on). */
  signInRedirect: string;
  className?: string;
}

const LINK_CLASS =
  "font-semibold text-primary underline underline-offset-2 hover:text-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * CreateGuestAccount — «Створити акаунт на <email>» after a guest order
 * (TASK-2010 (д), B-12 тема 2; the banner half of TASK-1999).
 *
 * One click instead of the bare `/register` it replaces: `POST
 * /orders/guest/:token/account` makes a password-less account on the order's
 * own address, attaches THIS order at once (the token proves it is theirs) and
 * sends the «Задайте пароль» letter. With a session in the answer the shopper is
 * signed in and taken to the order in their cabinet; without one (`{}` — the
 * account exists, signing in failed) the letter is the way in, and we say so.
 *
 * 409 ACCOUNT_EXISTS: the address already has an account — never a second one.
 * «Увійти» returns here; the order joins that account once its address is
 * confirmed (TASK-485).
 */
export function CreateGuestAccount({
  token,
  orderId,
  email,
  signInRedirect,
  className,
}: CreateGuestAccountProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setTokens } = useAuth();
  const g = dict.order.guest;

  const create = useCreateGuestOrderAccount({
    mutation: {
      onSuccess: (response) => {
        const accessToken = response?.data?.accessToken;
        if (!accessToken) return;
        setTokens(accessToken);
        void queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        void queryClient.invalidateQueries({
          queryKey: getGetWishlistQueryKey(),
        });
        router.push(`/account/orders/${encodeURIComponent(orderId)}`);
      },
    },
  });

  const status = apiErrorStatus(create.error);
  const exists =
    status === 409 && apiErrorCode(create.error) === "ACCOUNT_EXISTS";
  const createdWithoutSession =
    create.isSuccess && !create.data?.data?.accessToken;

  if (createdWithoutSession) {
    return (
      <p role="status" className={`text-sm text-foreground ${className ?? ""}`}>
        {g.oneClickCreated}
      </p>
    );
  }

  if (exists) {
    return (
      <p role="alert" className={`text-sm text-foreground ${className ?? ""}`}>
        {g.oneClickExists}{" "}
        <Link
          href={`/login?redirect=${encodeURIComponent(signInRedirect)}`}
          className={LINK_CLASS}
        >
          {g.oneClickSignIn}
        </Link>
      </p>
    );
  }

  return (
    <div className={`flex flex-col items-start gap-2 ${className ?? ""}`}>
      <Button
        type="button"
        onClick={() => create.mutate({ token })}
        disabled={create.isPending || create.isSuccess}
        // A long address must wrap rather than push the button off-screen.
        className="h-auto min-h-10 max-w-full whitespace-normal text-left"
      >
        <UserPlus className="size-4 shrink-0" aria-hidden />
        <span className="break-all">
          {create.isPending ? g.oneClickPending : g.oneClickCta(email)}
        </span>
      </Button>
      {create.isError && (
        <p role="alert" className="text-sm text-destructive">
          {status === 429 ? g.oneClickTooMany : g.oneClickError}
        </p>
      )}
    </div>
  );
}
