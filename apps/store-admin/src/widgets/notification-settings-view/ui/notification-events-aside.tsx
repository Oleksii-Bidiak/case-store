import type { ReactNode } from "react";
import {
  MessageSquareIcon,
  ShoppingCartIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";

/**
 * «Що приходить» — the three shop events that reach Telegram and what each
 * message looks like (texts from the API's `telegram/templates`, plan 187A).
 * Static on purpose: it answers «what will I get if I connect?» before anyone
 * connects. The «Відкрити в адмінці» in a bubble is a picture of the link the
 * real message carries, not a link — there is nothing to open in a sample.
 */
export function NotificationEventsAside() {
  const t = dict.notificationSettings;
  return (
    <aside
      aria-labelledby="notification-events-title"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:w-85 lg:shrink-0"
    >
      <h3
        id="notification-events-title"
        className="text-sm font-semibold text-foreground"
      >
        {t.eventsTitle}
      </h3>
      <ul className="flex flex-col gap-4">
        <EventPreview
          icon={ShoppingCartIcon}
          title={t.eventOrder}
          hint={t.eventOrderHint}
        >
          <span aria-hidden="true">🛒 </span>
          <b className="font-semibold">{t.previewOrderTitle}</b>
          <br />
          {t.previewOrderSum(formatCurrency(2349))}
          <br />
          {t.previewOrderDelivery}
          <br />
          {t.previewOrderBuyer}
        </EventPreview>
        <EventPreview icon={MessageSquareIcon} title={t.eventMessage}>
          <span aria-hidden="true">✉️ </span>
          <b className="font-semibold">{t.previewMessageTitle}</b>{" "}
          {t.previewMessageFrom}
          <br />
          {t.previewMessageSubject}
          <br />
          {t.previewMessageText}
        </EventPreview>
        <EventPreview icon={Undo2Icon} title={t.eventReturn}>
          <span aria-hidden="true">↩️ </span>
          <b className="font-semibold">{t.previewReturnTitle}</b>{" "}
          {t.previewReturnOrder}
        </EventPreview>
      </ul>
      <p className="text-xs text-muted-foreground">{t.eventsHint}</p>
    </aside>
  );
}

function EventPreview({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const t = dict.notificationSettings;
  return (
    <li className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {title}
      </span>
      <div
        role="group"
        aria-label={t.previewAria(title)}
        className="self-start rounded-xl rounded-bl-sm bg-primary/8 px-2.5 py-2 text-pill leading-5 text-foreground"
      >
        {children}
        <br />
        <span className="text-primary">{t.previewOpen}</span>
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </li>
  );
}
