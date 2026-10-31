"use client";

import {
  useGetGuestOrderReturns,
  useGetOrderReturns,
} from "@/shared/api/generated/returns/returns";
import type { ReturnEntity } from "@/shared/api/generated/models";
import { dict } from "@/shared/config";
import { Button } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { ReturnHistory } from "./return-history";

interface FetchedReturnHistoryProps {
  returns: readonly ReturnEntity[] | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: () => unknown;
  className?: string;
}

/**
 * The states around {@link ReturnHistory}, shared by the account and the
 * guest door: nothing while loading and nothing for an order without returns
 * — most orders never have one, so a skeleton would flash a card that then
 * vanishes; a one-line alert with «Спробувати ще раз» on failure, so a
 * customer waiting on a decision is not told, by silence, that there is none.
 */
function FetchedReturnHistory({
  returns,
  isError,
  isFetching,
  refetch,
  className,
}: FetchedReturnHistoryProps) {
  if (isError) {
    return (
      <div className={cn("flex flex-col items-start gap-3", className)}>
        <p
          role="alert"
          className="rounded-menu border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {dict.returnRequest.loadError}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={isFetching}
          onClick={() => void refetch()}
          className="h-11 rounded-cta px-4.5 font-semibold"
        >
          {dict.common.retry}
        </Button>
      </div>
    );
  }

  return <ReturnHistory returns={returns ?? []} className={className} />;
}

interface OrderReturnHistoryProps {
  orderId: string;
  /** Hold the request back until the page has a session (default: ask). */
  enabled?: boolean;
  className?: string;
}

/**
 * OrderReturnHistory — the signed-in customer's return requests for one
 * order (TASK-1962), on the account order detail and the confirmation page.
 *
 * Shares its query with `ReturnRequestButton`, which invalidates it after a
 * new request — the history picks the new row up by itself.
 */
export function OrderReturnHistory({
  orderId,
  enabled = true,
  className,
}: OrderReturnHistoryProps) {
  const { data, isError, isFetching, refetch } = useGetOrderReturns(orderId, {
    query: { enabled },
  });

  return (
    <FetchedReturnHistory
      returns={data?.data}
      isError={isError}
      isFetching={isFetching}
      refetch={refetch}
      className={className}
    />
  );
}

interface GuestOrderReturnHistoryProps {
  /** The order's access token from the confirmation email. */
  token: string;
  className?: string;
}

/**
 * GuestOrderReturnHistory — the same history on a guest order (TASK-1965),
 * read by the order's access token: the public projection, so no operator
 * notes and no names of who decided.
 *
 * Shares its query with the guest `ReturnRequestButton`, which invalidates it
 * after a new request.
 */
export function GuestOrderReturnHistory({
  token,
  className,
}: GuestOrderReturnHistoryProps) {
  const { data, isError, isFetching, refetch } = useGetGuestOrderReturns(token);

  return (
    <FetchedReturnHistory
      returns={data?.data}
      isError={isError}
      isFetching={isFetching}
      refetch={refetch}
      className={className}
    />
  );
}
