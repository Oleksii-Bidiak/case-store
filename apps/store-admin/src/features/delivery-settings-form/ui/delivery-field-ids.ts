import type { DELIVERY_FIELD_ORDER } from "../model/delivery-settings-schema";

/**
 * DOM ids of the validated fields. Fixed rather than `useId`, because a
 * blocked submit has to find the first invalid one by name (forms.md Rule 4a)
 * and the pickers are `Combobox`es, which take an id but no RHF ref.
 */
export const DELIVERY_FIELD_IDS = {
  senderCityName: "delivery-sender-city",
  senderWarehouseName: "delivery-sender-warehouse",
  defaultWeightKg: "delivery-default-weight",
  courierCityName: "delivery-courier-city",
  courierPrice: "delivery-courier-price",
  courierFreeFrom: "delivery-courier-free-from",
} as const satisfies Record<(typeof DELIVERY_FIELD_ORDER)[number], string>;
