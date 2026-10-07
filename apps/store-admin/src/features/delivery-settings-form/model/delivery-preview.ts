import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib/format";
import {
  parseMoney,
  type DeliverySettingsFormValues,
} from "./delivery-settings-schema";

const t = dict.deliverySettingsForm;

export type DeliveryPreviewMethod = "np" | "pickup" | "courier" | "other";

export interface DeliveryPreviewRow {
  method: DeliveryPreviewMethod;
  title: string;
  line: string;
}

/** «Курʼєр · Київ», or the card's own name while no city is set. */
export function courierTitle(cityName: string): string {
  const city = cityName.trim();
  return city ? t.courierNamed(city) : t.courierTitle;
}

/** «150 ₴ · безкоштовно від 2 000 ₴», «150 ₴», «Безкоштовно». */
function courierLine(price: string, freeFrom: string): string {
  const amount = parseMoney(price);
  if (amount === null) return t.previewCourierNoPrice;
  if (amount === 0) return t.previewFree;
  const threshold = freeFrom.trim() === "" ? null : parseMoney(freeFrom);
  return threshold === null
    ? formatCurrency(amount)
    : t.previewCourierThreshold(
        formatCurrency(amount),
        formatCurrency(threshold),
      );
}

/**
 * «Так побачить покупець на чекауті» — the methods the storefront would offer
 * for these (unsaved) values, in the order of the cards, which is the order
 * `GET /api/delivery/methods` lists them in.
 *
 * PICKUP needs at least one ACTIVE point as well as its switch, exactly as the
 * API decides it: an enabled method with nothing to pick is not served to the
 * checkout. `activePickupPoints` is `null` while the point list is not known
 * (loading or failed) — the row is left out then rather than promised.
 */
export function buildDeliveryPreview(
  values: Pick<
    DeliverySettingsFormValues,
    | "npEnabled"
    | "pickupEnabled"
    | "courierEnabled"
    | "otherEnabled"
    | "courierCityName"
    | "courierPrice"
    | "courierFreeFrom"
  >,
  activePickupPoints: number | null,
): DeliveryPreviewRow[] {
  const rows: DeliveryPreviewRow[] = [];
  if (values.npEnabled) {
    rows.push({ method: "np", title: t.npTitle, line: t.previewNp });
  }
  if (
    values.pickupEnabled &&
    activePickupPoints !== null &&
    activePickupPoints > 0
  ) {
    rows.push({
      method: "pickup",
      title: t.pickupTitle,
      line: t.previewPickup(activePickupPoints),
    });
  }
  if (values.courierEnabled) {
    rows.push({
      method: "courier",
      title: courierTitle(values.courierCityName),
      line: courierLine(values.courierPrice, values.courierFreeFrom),
    });
  }
  if (values.otherEnabled) {
    rows.push({ method: "other", title: t.otherTitle, line: t.previewOther });
  }
  return rows;
}
