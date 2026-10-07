import type { ReactNode } from "react";
import { ArrowUpRight, Info } from "lucide-react";
import { dict } from "@/shared/config";
import { displayPhone } from "@/shared/lib/phone";
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

/** A note on a muted panel with an info glyph (`oc-dnote`) — what happens next. */
export function OrderDeliveryNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground">
      <Info
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <span>{children}</span>
    </p>
  );
}

/** The bold first line: the method, «Самовивіз · <точка>» or «Кур'єр · <місто>». */
function methodLine(details: OrderDeliveryDetails): string {
  const t = dict.order.deliveryBlock;
  if (details.method === "PICKUP" && details.pickup?.name) {
    return t.pickupTitle(details.pickup.name);
  }
  if (details.method === "COURIER" && details.city) {
    return t.courierTitle(details.city);
  }
  return t.methods[details.method] ?? details.method;
}

/**
 * «<місто>, <адреса>» — unless the owner already typed the city into the
 * point's address (the letter template's guard): never «Київ, Київ, вул. …».
 */
function cityAndAddress(city: string | null, address: string | null): string {
  if (!address) return city ?? "";
  if (!city || address.startsWith(city)) return address;
  return `${city}, ${address}`;
}

/**
 * The lines under the method line, per method; empty parts are dropped. The
 * recipient comes first and is rendered in foreground colour (the mockup):
 * it is who the parcel — or, for pickup, the counter — is waiting for.
 */
function addressLines(details: OrderDeliveryDetails): {
  recipient: string | null;
  lines: string[];
} {
  const phone = details.phone ? displayPhone(details.phone) : "";

  switch (details.method) {
    case "PICKUP":
      // OrderConfirmation.dc.html #pickup: who collects it, the point's
      // address, its hours and own phone, then the buyer's phone.
      return {
        recipient: details.recipient,
        lines: [
          cityAndAddress(details.city, details.pickup?.address ?? null),
          [details.pickup?.hours, details.pickup?.phone]
            .filter(Boolean)
            .join(" · "),
          phone,
        ],
      };
    case "NOVA_POSHTA":
      return {
        recipient: details.recipient,
        lines: [details.place?.value ?? "", details.city ?? "", phone],
      };
    case "COURIER":
    case "OTHER":
    default:
      return {
        recipient: details.recipient,
        lines: [details.street ?? "", details.city ?? "", phone],
      };
  }
}

/**
 * OrderDeliveryBlock — «Доставка» on the order confirmation page and the
 * guest order page (TASK-647, OrderConfirmation.dc.html). One component for
 * the four methods, read from the order's address snapshot:
 *
 *   - Nova Poshta — recipient, branch, city, phone;
 *   - pickup — «Самовивіз · <точка>», who collects it, the point's address,
 *     hours and phone as they were at checkout, the buyer's phone,
 *     «Як дістатися ↗», and the "we will call" note;
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
  const { recipient, lines: allLines } = addressLines(details);
  const lines = allLines.filter(Boolean);
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
        {recipient && <span className="text-foreground">{recipient}</span>}
        {lines.map((line, index) => (
          <span key={`${index}-${line}`}>{line}</span>
        ))}
      </address>
      {mapUrl && <OrderDeliveryMapLink href={mapUrl} />}
      {note && <OrderDeliveryNote>{note}</OrderDeliveryNote>}
    </section>
  );
}
