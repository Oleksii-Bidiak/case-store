"use client";

import {
  AdminNewsletterControllerFindAllStatus,
  type NewsletterSubscriptionEntity,
} from "@/entities/newsletter";
import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui";
import { formatDate, formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { subscriberSourceLabel } from "../model/subscriber-source";

const d = dict.subscribers;

export function SubscriberStatusBadge({
  status,
}: {
  status: NewsletterSubscriptionEntity["status"];
}) {
  // Badge canon (§1.6): the positive state filled, the other grey — an
  // unsubscribe is a choice the person made, not an error.
  return status === AdminNewsletterControllerFindAllStatus.SUBSCRIBED ? (
    <Badge variant="default">{d.statusSubscribed}</Badge>
  ) : (
    <Badge variant="secondary">{d.statusUnsubscribed}</Badge>
  );
}

interface SubscriberCardSheetProps {
  subscriber: NewsletterSubscriptionEntity | undefined;
  onOpenChange: (open: boolean) => void;
}

/**
 * The subscriber card (SubscribersProposal ПД3) with the fields the API has
 * today: status, source, when they subscribed, when they left, last change.
 * The consent journal, topics, the buyer link, the welcome code and the
 * waiting list of the artboard are API tails (TASK-1063…1066) and are not
 * drawn — an empty «Журнал згоди» would read as "nobody consented".
 */
export function SubscriberCardSheet({
  subscriber,
  onOpenChange,
}: SubscriberCardSheetProps) {
  return (
    <Sheet open={Boolean(subscriber)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {subscriber ? (
          <>
            <SheetHeader className="gap-2 border-b border-border pr-12">
              <SheetTitle className="break-all">{subscriber.email}</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <SubscriberStatusBadge status={subscriber.status} />
                  <span>
                    {d.cardSince(formatDate(subscriber.createdAt))}
                    {subscriber.source
                      ? ` · ${subscriberSourceLabel(subscriber.source)}`
                      : ""}
                  </span>
                </div>
              </SheetDescription>
            </SheetHeader>

            <section className="flex flex-col gap-3 px-4 py-2">
              <h3 className="text-sm font-semibold text-foreground">
                {d.cardSection}
              </h3>
              <dl className="flex flex-col gap-2 text-sm">
                <Row label={d.colStatus}>
                  <SubscriberStatusBadge status={subscriber.status} />
                </Row>
                <Row label={d.colSource}>
                  {subscriberSourceLabel(subscriber.source)}
                </Row>
                <Row label={d.colDate}>
                  {formatDateTime(subscriber.createdAt)}
                </Row>
                <Row label={d.colUnsubscribed}>
                  {subscriber.unsubscribedAt
                    ? formatDateTime(subscriber.unsubscribedAt)
                    : d.sourceEmpty}
                </Row>
                <Row label={d.cardUpdated}>
                  {formatDateTime(subscriber.updatedAt)}
                </Row>
              </dl>
            </section>

            <SheetFooter className="border-t border-border">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  {dict.common.close}
                </Button>
              </SheetClose>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground tabular-nums">{children}</dd>
    </div>
  );
}
