// Delivery entity — the admin's delivery settings, its pickup points, and the
// Nova Poshta directory lookups (TASK-644, plan 184 U).
//
// The `delivery` Orval tag is the one generated group the `@/shared/api` barrel
// does not re-export (it also carries the storefront's public checkout reads),
// so this slice names exactly what the admin uses, straight from the generated
// module — the rest of the app depends on `@/entities/delivery`, never on
// `shared/api/generated` directly. Named, not `*`: `useGetDeliveryMethods` and
// `useEstimateDelivery` are the storefront's, not the panel's.

export {
  // Nova Poshta directory (public proxy; used by the sender-city picker on
  // /settings/delivery and the operator's create-order address fields).
  useSearchDeliveryCities,
  useSearchDeliveryWarehouses,
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

export type {
  AdminPickupPointDto,
  AdminPickupPointListResponse,
  CreatePickupPointDto,
  DeliverySettingDto,
  NpCityDto,
  NpWarehouseDto,
  ReorderPickupPointsDto,
  UpdateDeliverySettingDto,
  UpdatePickupPointDto,
} from "@/shared/api";
