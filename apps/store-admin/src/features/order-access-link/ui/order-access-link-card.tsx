"use client";

import { useState } from "react";
import { useAdminOrderControllerIssueAccessLink } from "@/entities/order";
import { Button, CopyButton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";

interface OrderAccessLinkCardProps {
  orderId: string;
}

/**
 * OrderAccessLinkCard — "give this buyer a link to their own order" (TASK-484).
 *
 * ── Why there is a button and not a value ─────────────────────────────────────
 * The order row holds only the SHA-256 of the access token, so the panel CANNOT
 * display the link the customer currently has — nothing in the system can. The
 * only available move is to mint a new one, and doing that retires the old one.
 * The copy says both things before the operator commits, because the surprising
 * case is real: a customer who says "I lost the link" gets a working one, and a
 * customer who says "I forwarded it to my wife, resend it to me" costs the wife
 * her copy.
 *
 * ── Why the link is rendered as selectable text, not only behind the button ───
 * `navigator.clipboard` refuses on an insecure origin, which is exactly how an
 * admin panel gets opened on a staging box over plain HTTP. When the copy fails
 * the operator still has to be able to select the URL by hand, so it is on the
 * page rather than hidden inside the button.
 *
 * ── Why the value is dropped on unmount ───────────────────────────────────────
 * Local state only, never cached in React Query: a one-shot secret that survives
 * a navigation would sit in the query cache for as long as the tab is open, and
 * "shown once" would quietly become "shown whenever you come back".
 */
export function OrderAccessLinkCard({ orderId }: OrderAccessLinkCardProps) {
  const d = dict.orderAccess;
  const [link, setLink] = useState<{ url: string; issuedAt: string } | null>(
    null,
  );
  const issue = useAdminOrderControllerIssueAccessLink();

  const onIssue = () => {
    issue.mutate(
      { orderId },
      {
        onSuccess: (response) => {
          setLink({
            url: response.data.url,
            issuedAt: response.data.issuedAt,
          });
        },
      },
    );
  };

  // 400 means STORE_CLIENT_URL is unset — a deployment defect rather than
  // something the operator did, so it names who can fix it.
  const status = (issue.error as { response?: { status?: number } } | null)
    ?.response?.status;
  const errorMessage = issue.isError
    ? status === 400
      ? d.failedNotConfigured
      : d.failed
    : null;

  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold text-foreground">{d.heading}</h3>
      <p className="text-xs text-muted-foreground">{d.description}</p>

      {link ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-foreground">
            {d.issuedHeading}
          </p>
          <p
            aria-label={d.linkAria}
            className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all text-foreground select-all"
          >
            {link.url}
          </p>
          <CopyButton
            value={link.url}
            label={d.copy}
            copiedLabel={d.copied}
            failedLabel={d.copyFailed}
            ariaLabel={d.copyAria}
          />
          <p className="text-xs text-muted-foreground">
            {d.issuedAt(formatDateTime(link.issuedAt))}
          </p>
          <p className="text-xs font-medium text-warning">
            {d.issuedOnceWarning}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{d.rotateHint}</p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={issue.isPending}
        onClick={onIssue}
      >
        {issue.isPending ? d.issuing : d.issue}
      </Button>

      {errorMessage && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
