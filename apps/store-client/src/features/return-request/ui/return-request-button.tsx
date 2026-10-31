"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ReturnOutcome } from "@/entities/return";
import { dict } from "@/shared/config";
import { isNetworkError } from "@/shared/lib";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from "@/shared/ui";
import { readReturnRequestError } from "../model/return-error";
import {
  clampQuantity,
  returnableLines,
  type OrderLine,
} from "../model/returnable-units";
import {
  useReturnRequestSource,
  type ReturnRequestSource,
} from "../model/use-return-request-source";

interface ReturnRequestButtonProps {
  /** Which order, and through which door: the account or a guest link. */
  source: ReturnRequestSource;
  /** Short order number, as it is written everywhere else on the storefront. */
  orderNumber: string;
  items: readonly OrderLine[];
  /**
   * Extra classes for the trigger, merged over its `sm` outline look — the
   * order history sets its 44px `rounded-cta` action size here (TASK-217).
   */
  className?: string;
}

/** «На розсуд магазину» is the empty choice: nothing is sent. */
type OutcomeChoice = ReturnOutcome | "";

const OUTCOME_CHOICES: readonly OutcomeChoice[] = [
  "",
  ReturnOutcome.REFUND,
  ReturnOutcome.REPLACEMENT,
  ReturnOutcome.REPAIR,
];

/** True only when the browser itself says it has no connection. */
function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * «Подати заяву на повернення» (TASK-373).
 *
 * Ukrainian law gives 14 days to return, `POST /orders/:orderId/returns` has
 * existed since TASK-340, and until now nothing in the storefront called it: the
 * account area had no button, so the only way a customer could open a return was
 * to write to support and have an operator do something the panel could not do
 * either (that half is TASK-469). This is the customer's door.
 *
 * WHY THE QUANTITIES ARE COMPUTED AND NOT ASSUMED. A line may be returned across
 * several requests — three bought, one back today, another next week — so the
 * server caps the SUM of live claims, not one request. The form asks the API what
 * is already claimed and offers only the remainder. Without it the obvious input
 * (the full quantity) is the one the server refuses, and a customer reads that as
 * a broken shop rather than as arithmetic.
 *
 * TASK-1964: the same dialog serves a guest order — `source` picks the pair of
 * generated hooks (see `useReturnRequestSource`). Nothing typed is ever lost:
 * a refusal keeps the dialog open, and while the browser is offline the request
 * waits for its `online` event and goes out once, by itself. An unreachable API
 * with the browser online is an ordinary failure: toast, dialog stays open.
 *
 * The dialog is the same controlled-`Dialog` pattern as `CancelOrderButton` —
 * never `window.confirm`, which cannot render a line list.
 */
export function ReturnRequestButton({
  source,
  orderNumber,
  items,
  className,
}: ReturnRequestButtonProps) {
  const baseId = useId();
  const reasonId = `${baseId}-reason`;
  const hintId = `${baseId}-hint`;
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<OutcomeChoice>("");
  // Set while a request is waiting for the connection to come back.
  const [awaitingNetwork, setAwaitingNetwork] = useState(false);

  // Asked only while the dialog is open: on a history page of twenty orders,
  // twenty speculative requests for something nobody has clicked is a page that
  // loads slowly for everyone to help the one person who will.
  const ledger = useReturnRequestSource(source, { enabled: open });

  // TASK-631. The fields wait for the "already returned" ledger: before it
  // arrives every line looks fully returnable, so a quantity typed in that
  // window could be larger than what the server will accept. The value rendered
  // is always the clamped one — what is on screen is what goes in the request.
  const ledgerSettled = ledger.returns !== undefined || ledger.isError;
  const lines = returnableLines(items, ledger.returns ?? []);
  const selected = lines
    .map((line) => ({
      orderItemId: line.orderItemId,
      quantity: clampQuantity(
        quantities[line.orderItemId] ?? 0,
        line.remaining,
      ),
    }))
    .filter((line) => line.quantity > 0);
  const nothingSelected = selected.length === 0;

  // Clearing every quantity withdraws the request: the wait ends (and its
  // `online` listener with it — see the effect below), so a later reconnect
  // never files lines typed afterwards without a fresh «Надіслати».
  // Render-time guard, not an effect: no frame shows the stale promise.
  if (awaitingNetwork && nothingSelected) setAwaitingNetwork(false);

  function close() {
    setOpen(false);
    setQuantities({});
    setReason("");
    setOutcome("");
    setAwaitingNetwork(false);
  }

  const handleSubmit = () => {
    if (nothingSelected) {
      setAwaitingNetwork(false);
      return;
    }
    // Known offline: do not even try — keep everything and wait for `online`.
    if (isBrowserOffline()) {
      setAwaitingNetwork(true);
      return;
    }
    setAwaitingNetwork(false);
    ledger.submit(
      {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(outcome ? { requestedOutcome: outcome } : {}),
        items: selected,
      },
      {
        onSuccess: () => {
          toast.success(dict.returnRequest.success);
          close();
        },
        onError: (error) => {
          // The connection dropped mid-request: the same as being offline —
          // but only if the browser agrees it is offline. Axios also reports
          // ERR_NETWORK while online when the API is unreachable (store-api
          // down behind Caddy: a 502 without CORS headers). No `online` event
          // follows that, so it gets the generic retry toast (SF-ACC-31).
          if (isNetworkError(error) && isBrowserOffline()) {
            setAwaitingNetwork(true);
            return;
          }
          // Any refusal keeps the dialog open with everything typed (SF-ACC-31).
          const { message, refreshLedger } = readReturnRequestError(error);
          if (refreshLedger) ledger.refreshLedger();
          toast.error(message);
        },
      },
    );
  };

  // The `online` listener must send what is on screen THEN, not what was there
  // when it was attached — the customer may keep editing while offline.
  const submitRef = useRef(handleSubmit);
  useEffect(() => {
    submitRef.current = handleSubmit;
  });

  // One automatic attempt per wait, and only while the dialog is open: closing
  // it removes the listener, so nothing is filed behind the customer's back.
  useEffect(() => {
    if (!open || !awaitingNetwork || nothingSelected) return;
    const onOnline = () => submitRef.current();
    window.addEventListener("online", onOnline, { once: true });
    return () => window.removeEventListener("online", onOnline);
  }, [open, awaitingNetwork, nothingSelected]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={className}
          aria-label={dict.returnRequest.triggerAria(orderNumber)}
        >
          {dict.returnRequest.trigger}
        </Button>
      </DialogTrigger>

      {/* TASK-1964: capped at the viewport and scrollable. Without it a phone
          with the keyboard up pushed the footer — and the hint next to the
          disabled button — below the screen with no way to scroll to it. */}
      <DialogContent className="max-h-dvh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dict.returnRequest.dialogTitle}</DialogTitle>
          <DialogDescription>
            {dict.returnRequest.dialogDescription}
          </DialogDescription>
        </DialogHeader>

        {ledger.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {dict.returnRequest.loadError}
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground">
            {dict.returnRequest.itemsHeading}
          </p>
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <li
                key={line.orderItemId}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="flex flex-col">
                  <span className="text-sm text-foreground">
                    {line.productName}
                  </span>
                  {line.remaining > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {dict.returnRequest.remainingOf(
                        line.remaining,
                        line.ordered,
                      )}
                    </span>
                  ) : null}
                </span>
                {/* SF-ACC-29: a line with nothing left says why in words,
                    instead of a greyed-out «0» that reads like a broken field. */}
                {line.remaining === 0 ? (
                  <span className="text-sm font-medium text-muted-foreground">
                    {line.underReview
                      ? dict.returnRequest.alreadyClaimed
                      : dict.returnRequest.nothingLeft}
                  </span>
                ) : (
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={line.remaining}
                    disabled={!ledgerSettled}
                    aria-label={dict.returnRequest.quantityAria(
                      line.productName,
                    )}
                    value={clampQuantity(
                      quantities[line.orderItemId] ?? 0,
                      line.remaining,
                    )}
                    onChange={(event) =>
                      setQuantities((previous) => ({
                        ...previous,
                        [line.orderItemId]: clampQuantity(
                          Number(event.target.value),
                          line.remaining,
                        ),
                      }))
                    }
                    className="w-20"
                  />
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* TASK-2044: what the customer would like — optional, the shop
            decides either way, so the default sends nothing. */}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold text-foreground">
            {dict.returnRequest.outcomeLegend}
          </legend>
          <div className="flex flex-wrap gap-x-4">
            {OUTCOME_CHOICES.map((choice) => (
              <label
                key={choice || "any"}
                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground"
              >
                <input
                  type="radio"
                  name={`${baseId}-outcome`}
                  value={choice}
                  checked={outcome === choice}
                  onChange={() => setOutcome(choice)}
                  className="size-4 shrink-0 accent-primary"
                />
                {choice
                  ? dict.returnRequest.outcomeLabels[choice]
                  : dict.returnRequest.outcomeAny}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>{dict.returnRequest.reason}</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={dict.returnRequest.reasonPlaceholder}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            {dict.returnRequest.reasonHint}
          </p>
        </div>

        {/* Always mounted so screen readers announce the text when it appears;
            `empty:hidden` keeps the grid gap from opening an empty row. */}
        <p
          role="status"
          className="text-sm font-medium text-foreground empty:hidden"
        >
          {awaitingNetwork ? dict.returnRequest.offline : null}
        </p>

        {/* SF-ACC-29: the hint used to be the FIRST child of the footer, whose
            mobile layout is `flex-col-reverse` — so on a phone it was drawn
            BELOW both buttons, at the very bottom edge of a dialog that could
            not scroll, in 12px muted type. It now sits above the buttons and
            is tied to the disabled one, so it is read with it. */}
        {nothingSelected ? (
          <p id={hintId} className="text-sm text-muted-foreground">
            {dict.returnRequest.nothingSelected}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {dict.returnRequest.cancel}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={nothingSelected || ledger.isPending}
            aria-describedby={nothingSelected ? hintId : undefined}
          >
            {ledger.isPending
              ? dict.returnRequest.submitting
              : dict.returnRequest.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
