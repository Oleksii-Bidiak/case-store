import type { ReactNode } from "react";
import { ArrowUpRight, Info } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import {
  orderDeliveryDetails,
  type OrderDeliveryDetails,
} from "../lib/order-delivery";

type DeliveryOrder = Parameters<typeof orderDeliveryDetails>[0];

/**
 * «Як дістатися ↗» — the pickup point's map link (the owner's URL, already
 * narrowed to http(s) by `orderDeliveryDetails`). A new tab, said out loud.
 */
export function OrderDeliveryMapLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const t = dict.order.deliveryBlock;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center gap-1 self-start rounded-sm text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:min-h-0",
        className,
      )}
    >
      {t.mapLink}
      <ArrowUpRight className="size-3.5" aria-hidden />
      <span className="sr-only">{t.newTab}</span>
    </a>
  );
}

/** A muted note with an info glyph — what happens next with this delivery. */
export function OrderDeliveryNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex max-w-prose items-start gap-2 self-start rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** The bold first line: the method, or «Самовивіз · <точка>». */
function methodLine(details: OrderDeliveryDetails): string {
  const t = dict.order.deliveryBlock;
  if (details.method === "PICKUP" && details.pickup?.name) {
    return t.pickupTitle(details.pickup.name);
  }
  return t.methods[details.method] ?? details.method;
}

/** The address lines under it, per method; empty parts are dropped. */
function addressLines(details: OrderDeliveryDetails): string[] {
  const join = (parts: (string | null)[], separator: string) =>
    parts.filter(Boolean).join(separator);

  switch (details.method) {
    case "PICKUP":
      // The shop's point, not the buyer: no recipient, the point's own phone.
      return [
        join([details.city, details.pickup?.address ?? null], ", "),
        join(
          [details.pickup?.hours ?? null, details.pickup?.phone ?? null],
          " · ",
        ),
      ];
    case "NOVA_POSHTA":
      return [
        details.recipient ?? "",
        details.place?.value ?? "",
        details.city ?? "",
        details.phone ?? "",
      ];
    case "COURIER":
    case "OTHER":
    default:
      return [
        details.recipient ?? "",
        details.street ?? "",
        details.city ?? "",
        details.phone ?? "",
      ];
  }
}

/**
 * OrderDeliveryBlock — «Доставка» on the order confirmation page and the
 * guest order page (TASK-647, OrderConfirmation.dc.html). One component for
 * the four methods, read from the order's address snapshot:
 *
 *   - Nova Poshta — recipient, branch, city, phone;
 *   - pickup — «Самовивіз · <точка>», the point's address, hours and phone as
 *     they were at checkout, «Як дістатися ↗», and the "we will call" note;
 *   - courier — recipient, street, city, phone;
 *   - other — what the buyer typed, and the note that an operator will price
 *     the delivery (only while it is still unpriced).
 *
 * Replaces the generic «Адреса доставки» address dump, which printed a pickup
 * point as if it were the buyer's home and said nothing about the method.
 */
export function OrderDeliveryBlock({ order }: { order: DeliveryOrder }) {
  const t = dict.order.deliveryBlock;
  const details = orderDeliveryDetails(order);
  const lines = addressLines(details).filter(Boolean);
  const mapUrl = details.method === "PICKUP" ? details.pickup?.mapUrl : null;

  let note: string | null = null;
  if (details.method === "PICKUP") note = t.pickupNote;
  else if (details.method === "OTHER" && details.shippingCostPending)
    note = t.otherNote;

  return (
    <section
      data-testid="order-delivery"
      aria-labelledby="order-delivery-heading"
      className="flex flex-col gap-3"
    >
      <h2
        id="order-delivery-heading"
        className="text-xl font-semibold text-foreground"
      >
        {t.heading}
      </h2>
      <address className="flex flex-col gap-0.5 text-sm text-muted-foreground not-italic">
        <span className="font-semibold text-foreground">
          {methodLine(details)}
        </span>
        {lines.map((line, index) => (
          <span key={`${index}-${line}`}>{line}</span>
        ))}
      </address>
      {mapUrl && <OrderDeliveryMapLink href={mapUrl} />}
      {note && <OrderDeliveryNote>{note}</OrderDeliveryNote>}
    </section>
  );
}
