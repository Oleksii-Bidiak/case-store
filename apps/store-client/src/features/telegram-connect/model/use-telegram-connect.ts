"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetMyTelegramNotificationsQueryKey,
  useCreateGuestOrderTelegramLink,
  useCreateMyTelegramLink,
  useGetGuestOrderTelegramNotifications,
  useGetMyTelegramNotifications,
  useRevokeMyTelegramNotifications,
  type CustomerTelegramLinkDto,
  type CustomerTelegramStatusDto,
} from "@/entities/notification";
import { apiErrorStatus } from "@/shared/lib";

/** Whose Telegram this is: the signed-in account, or a guest's single order. */
export type TelegramConnectTarget =
  | { kind: "me" }
  /** `token` — the order access token (the e-mail link's, or `guestAccessToken`). */
  | { kind: "guest"; token: string };

/**
 * Where the flow stands — derived on every render, never stored:
 *
 *   - `loading` — the first status read is in flight;
 *   - `error`   — the status could not be read (the guest's 404 included);
 *   - `na`      — the shop's bot is not configured or not answering;
 *   - `off`     — available, nothing connected, not waiting;
 *   - `waiting` — a link was asked for; polling until «Старт» lands;
 *   - `on`      — a chat is connected.
 */
export type TelegramConnectPhase =
  "loading" | "error" | "na" | "off" | "waiting" | "on";

/** Asking for a link failed: `conflict` = the API said the bot is not ok (409). */
export type TelegramLinkError = "conflict" | "other";

/** The link's life on the server — `BINDING_TOKEN_TTL_MS`, 15 minutes. */
export const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;

/**
 * A link younger than this is shown again on the next «Підключити» instead of
 * minting a new one (the guest POST allows 5 a minute). The minute of margin
 * keeps a shopper from opening a link that dies while Telegram is loading.
 */
const LINK_REUSE_MS = TELEGRAM_LINK_TTL_MS - 60 * 1000;

/**
 * Poll cadence while waiting. The guest status read is throttled to 20 a
 * minute per client, fail-closed: 3 s would spend exactly the whole budget
 * and turn the first «Я натиснув «Старт»» into a 429, so the guest polls at 4 s.
 */
export const TELEGRAM_POLL_MS = { me: 3000, guest: 4000 } as const;

export interface UseTelegramConnectOptions {
  /** Override the poll cadence (tests). */
  pollIntervalMs?: number;
}

export interface TelegramConnectController {
  phase: TelegramConnectPhase;
  /** The last status read; `undefined` until the first one lands. */
  status: CustomerTelegramStatusDto | undefined;
  /** The one-time link while waiting; `undefined` while it is being issued. */
  link: CustomerTelegramLinkDto | undefined;
  linkError: TelegramLinkError | null;
  /** «Підключити» — issue (or reuse) a link and start waiting. */
  start: () => void;
  /** «Я натиснув «Старт»» — read the status now instead of at the next poll. */
  checkNow: () => void;
  /** «Скасувати» — stop waiting. The link stays valid for a re-open. */
  cancel: () => void;
  /** Re-read the status after a failed read. */
  retryStatus: () => void;
  /**
   * True once after «Скасувати»: the connect button takes focus back when it
   * re-appears, so a keyboard user is not dropped onto `<body>`.
   */
  takeFocusRestore: () => boolean;
}

/**
 * useTelegramConnect — the customer/guest Telegram connect flow (TASK-679).
 *
 * The ONLY local state is `waiting` (plus a focus flag in a ref). Whether the
 * bot is available and whether a chat is connected always come from the
 * status query — docs/conventions/forms.md: server data is never copied into
 * `useState`. The link is the mutation's own data.
 */
export function useTelegramConnect(
  target: TelegramConnectTarget,
  { pollIntervalMs }: UseTelegramConnectOptions = {},
): TelegramConnectController {
  const queryClient = useQueryClient();
  const isGuest = target.kind === "guest";
  const token = isGuest ? target.token : "";
  const [waiting, setWaiting] = useState(false);
  const restoreFocus = useRef(false);

  const refetchInterval = waiting
    ? (pollIntervalMs ?? TELEGRAM_POLL_MS[target.kind])
    : false;

  // Both hooks are always called (rules of hooks); only the target's is enabled.
  const meQuery = useGetMyTelegramNotifications({
    query: { enabled: !isGuest, refetchInterval },
  });
  const guestQuery = useGetGuestOrderTelegramNotifications(token, {
    // A guest 404 (unknown / expired / claimed by an account) is final, and a
    // retry would spend the fail-closed throttle budget for nothing.
    query: { enabled: isGuest && token !== "", refetchInterval, retry: false },
  });
  const statusQuery = isGuest ? guestQuery : meQuery;
  const status = statusQuery.data?.data;

  const onLinkError = (error: unknown) => {
    setWaiting(false);
    // The account row turns into «Тимчасово недоступно» once the status says
    // so. The guest card is hidden when unavailable, so it is NOT refetched
    // there: the alert under the button is the guest's explanation.
    if (!isGuest && apiErrorStatus(error) === 409) {
      void queryClient.invalidateQueries({
        queryKey: getGetMyTelegramNotificationsQueryKey(),
      });
    }
  };
  const meLink = useCreateMyTelegramLink({
    mutation: { onError: onLinkError },
  });
  const guestLink = useCreateGuestOrderTelegramLink({
    mutation: { onError: onLinkError },
  });
  const linkMutation = isGuest ? guestLink : meLink;
  const link = linkMutation.data?.data;
  const linkIssuedAt = linkMutation.submittedAt;

  const linkError: TelegramLinkError | null = linkMutation.isError
    ? apiErrorStatus(linkMutation.error) === 409
      ? "conflict"
      : "other"
    : null;

  // Render-time guard (forms.md): once the server says connected — or the bot
  // went away — the waiting flag has served its purpose.
  if (waiting && status && (status.connected || !status.available)) {
    setWaiting(false);
  }

  // Stop waiting when the link's life runs out; the next click mints a new one.
  // Counted from when the link was ASKED FOR on this clock, never from
  // `expiresAt` against a browser clock that may disagree with the server's.
  useEffect(() => {
    if (!waiting || !link || !linkIssuedAt) return;
    const left = TELEGRAM_LINK_TTL_MS - (Date.now() - linkIssuedAt);
    const id = setTimeout(() => setWaiting(false), Math.max(0, left));
    return () => clearTimeout(id);
  }, [waiting, link, linkIssuedAt]);

  const start = () => {
    const fresh =
      link !== undefined &&
      linkIssuedAt > 0 &&
      Date.now() - linkIssuedAt < LINK_REUSE_MS;
    setWaiting(true);
    if (fresh) return;
    if (isGuest) guestLink.mutate({ token });
    else meLink.mutate();
  };

  let phase: TelegramConnectPhase;
  if (!status) phase = statusQuery.isError ? "error" : "loading";
  else if (!status.available) phase = "na";
  else if (status.connected) phase = "on";
  else if (waiting) phase = "waiting";
  else phase = "off";

  return {
    phase,
    status,
    link,
    linkError,
    start,
    checkNow: () => void statusQuery.refetch(),
    cancel: () => {
      restoreFocus.current = true;
      setWaiting(false);
    },
    retryStatus: () => void statusQuery.refetch(),
    takeFocusRestore: () => {
      const value = restoreFocus.current;
      restoreFocus.current = false;
      return value;
    },
  };
}

/**
 * «Відключити» in the account — revokes the caller's own CUSTOMER chats (204,
 * idempotent) and re-reads the status, which is what flips the row back.
 */
export function useDisconnectMyTelegram() {
  const queryClient = useQueryClient();
  return useRevokeMyTelegramNotifications({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getGetMyTelegramNotificationsQueryKey(),
        }),
    },
  });
}
