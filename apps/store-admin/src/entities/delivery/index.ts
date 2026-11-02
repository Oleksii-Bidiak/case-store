// Delivery entity — the admin's delivery settings, its pickup points, and the
// Nova Poshta directory lookups (TASK-644, plan 184 U).
//
// The `delivery` Orval tag is the one generated group the `@/shared/api` barrel
// does not re-export (it also carries the storefront's public checkout reads),
// so this slice names exactly what the admin uses, straight from the generated
// module — the rest of the app depends on `@/entities/delivery`, never on
// `shared/api/generated` directly. Named, not `*`: `useEstimateDelivery` is the
// storefront's, not the panel's. `useGetDeliveryMethods` is shared since
// TASK-1973: the operator's phone order and delivery edit offer exactly what
// the checkout offers (enabled methods, active points, the payment matrix), and
// the public read needs no `settings:delivery` — an `orders:write` operator can
// use it where `useListAdminPickupPoints` would 403.

export {
  // Nova Poshta directory (public proxy; used by the sender-city picker on
  // /settings/delivery and the operator's create-order address fields).
  useSearchDeliveryCities,
  useSearchDeliveryWarehouses,
  // What the shop offers right now (public; TASK-1973 phone orders + edits).
  useGetDeliveryMethods,
  getGetDeliveryMethodsQueryKey,
  // The singleton settings row (`settings:delivery`).
  useGetDeliverySettings,
  getGetDeliverySettingsQueryKey,
  useUpdateDeliverySettings,
  // Pickup points (`settings:delivery`).
  useListAdminPickupPoints,
  getListAdminPickupPointsQueryKey,
  getListAdminPickupPointsQueryOptions,
  useCreatePickupPoint,
  useUpdatePickupPoint,
  useDeletePickupPoint,
  useReorderPickupPoints,
} from "@/shared/api/generated/delivery/delivery";

// TASK-1973: the pickup point cards of the phone order and the delivery edit.
export { PickupPointPicker } from "./ui/pickup-point-picker";
// TASK-1973: the NP directory pickers, shared by the phone order and the
// delivery edit of an existing order.
export {
  NpCityField,
  NpWarehouseField,
  type NpAddressValues,
} from "./ui/np-address-fields";

export type {
  AdminPickupPointDto,
  AdminPickupPointListResponse,
  CourierTermsDto,
  CreatePickupPointDto,
  DeliveryMethod,
  DeliveryMethodsDto,
  DeliveryPaymentMatrixDto,
  DeliverySettingDto,
  NpCityDto,
  NpWarehouseDto,
  PickupPointPublicDto,
  ReorderPickupPointsDto,
  UpdateDeliverySettingDto,
  UpdatePickupPointDto,
} from "@/shared/api";
