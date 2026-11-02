"use client";

import { useCallback, useState } from "react";
import { z } from "zod";
import { useGetCheckoutEmailStatus } from "@/entities/session";

/** Compare addresses the way the server does — case and whitespace aside. */
export function normalizeCheckoutEmail(email: string | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

const isEmail = (value: string) => z.string().email().safeParse(value).success;

interface KnownStatus {
  email: string;
  hasAccount: boolean;
}

/**
 * useCheckoutEmailStatus — «is there already an account on this address?»
 * for the guest contact block (TASK-2010, B-12 тема 2 (б)).
 *
 * Asked on blur of a valid e-mail, never per keystroke: the endpoint is the
 * same oracle as the 409 from `/register`, so the server rate-limits it (10 a
 * minute) and fails closed. Any failure — 429, 503, the network — simply leaves
 * the answer unknown: the hint is a convenience, and checkout never waits on
 * it or blocks because of it. A 409 ACCOUNT_EXISTS from `POST /orders` is the
 * authoritative answer and lands here through {@link markHasAccount}.
 *
 * The answer is keyed by the address it was given for. Editing the e-mail
 * therefore drops the hint at once — no stale «у вас уже є акаунт» under an
 * address that was never checked — and a response that arrives after the
 * shopper moved on is filed under the old address, where it harms nothing.
 */
export function useCheckoutEmailStatus() {
  const [known, setKnown] = useState<KnownStatus | null>(null);
  const { mutate } = useGetCheckoutEmailStatus();

  /** Ask about `raw` — only a well-formed address, and only once per address. */
  const check = useCallback(
    (raw: string | undefined) => {
      const email = normalizeCheckoutEmail(raw);
      if (!email || !isEmail(email) || known?.email === email) return;
      mutate(
        { data: { email } },
        {
          onSuccess: (response) => {
            const hasAccount = response?.data?.hasAccount;
            if (typeof hasAccount === "boolean") {
              setKnown({ email, hasAccount });
            }
          },
        },
      );
    },
    [known?.email, mutate],
  );

  /** The server refused to create a second account on this address (409). */
  const markHasAccount = useCallback((raw: string | undefined) => {
    const email = normalizeCheckoutEmail(raw);
    if (email) setKnown({ email, hasAccount: true });
  }, []);

  /** Whether `raw` is an address known to have an account. */
  const hasAccountFor = (raw: string | undefined) => {
    const email = normalizeCheckoutEmail(raw);
    return Boolean(email) && known?.email === email && known.hasAccount;
  };

  return { check, markHasAccount, hasAccountFor };
}
