"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  getGetGuestOrderReturnsQueryKey,
  getGetMyReturnsQueryKey,
  getGetOrderReturnsQueryKey,
  useCreateGuestReturn,
  useCreateReturn,
  useGetGuestOrderReturns,
  useGetOrderReturns,
  type CreateReturnDto,
} from "@/entities/return";
import type { ExistingReturn } from "./returnable-units";

/**
 * Where a return request is filed (TASK-1964).
 *
 * - `account` — a signed-in customer's own order, by id
 *   (`/orders/:orderId/returns`, the owner is checked by the API).
 * - `guest` — an order placed without an account, by its access token
 *   (`/orders/guest/:token/returns`, the token IS the authorisation).
 */
export type ReturnRequestSource =
  { kind: "account"; orderId: string } | { kind: "guest"; token: string };

export interface ReturnRequestCallbacks {
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

export interface ReturnRequestSourceState {
  /** What is already claimed on the order; `undefined` until it arrives. */
  returns: readonly ExistingReturn[] | undefined;
  isError: boolean;
  isPending: boolean;
  submit: (data: CreateReturnDto, callbacks: ReturnRequestCallbacks) => void;
  /** Refetch what is already claimed — after a refusal that says it changed. */
  refreshLedger: () => void;
}

/**
 * One adapter over the two pairs of generated hooks, so the dialog does not
 * know which kind of order it is on.
 *
 * Both pairs are always called (hooks may not be conditional) and the unused
 * query is simply disabled. A source does not change kind during the life of a
 * dialog — a widget renders one or the other.
 *
 * `networkMode: "always"` on both mutations: by default React Query PAUSES a
 * mutation it believes is offline and fires it on its own when the browser
 * reconnects — even after the customer closed the dialog. The dialog owns the
 * offline case itself (it waits for `online` only while it is open), so the
 * query client must not hold a second, invisible copy of the request.
 */
export function useReturnRequestSource(
  source: ReturnRequestSource,
  { enabled }: { enabled: boolean },
): ReturnRequestSourceState {
  const queryClient = useQueryClient();
  const isGuest = source.kind === "guest";
  const orderId = source.kind === "account" ? source.orderId : "";
  const token = source.kind === "guest" ? source.token : "";

  const accountLedger = useGetOrderReturns(orderId, {
    query: { enabled: enabled && !isGuest },
  });
  const guestLedger = useGetGuestOrderReturns(token, {
    query: { enabled: enabled && isGuest },
  });
  const ledger = isGuest ? guestLedger : accountLedger;
  const ledgerKey = isGuest
    ? getGetGuestOrderReturnsQueryKey(token)
    : getGetOrderReturnsQueryKey(orderId);

  const onCreated = () => {
    void queryClient.invalidateQueries({ queryKey: ledgerKey });
    // TASK-608: the account history shows the new request's status from this
    // list. A guest has no such list.
    if (!isGuest) {
      void queryClient.invalidateQueries({
        queryKey: getGetMyReturnsQueryKey(),
      });
    }
  };

  const createAccount = useCreateReturn({
    mutation: { networkMode: "always", onSuccess: onCreated },
  });
  const createGuest = useCreateGuestReturn({
    mutation: { networkMode: "always", onSuccess: onCreated },
  });

  return {
    returns: ledger.data?.data,
    isError: ledger.isError,
    isPending: isGuest ? createGuest.isPending : createAccount.isPending,
    submit: (data, callbacks) => {
      if (isGuest) createGuest.mutate({ token, data }, callbacks);
      else createAccount.mutate({ orderId, data }, callbacks);
    },
    refreshLedger: () => {
      void queryClient.invalidateQueries({ queryKey: ledgerKey });
    },
  };
}
