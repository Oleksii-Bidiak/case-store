// Delivery entity — re-exports generated Nova Poshta types and API hooks (FSD
// entities layer). Upper layers (features/widgets) import delivery data access
// from here, never from the generated client directly.
export type {
  NpCityDto,
  NpCityListResponse,
  NpWarehouseDto,
  NpWarehouseListResponse,
  NpEstimateDto,
  NpEstimateResponse,
  SearchDeliveryCitiesParams,
  SearchDeliveryWarehousesParams,
  EstimateDeliveryParams,
  // Delivery methods (TASK-646): what the shop switched on, the courier terms,
  // the active pickup points and the delivery × payment matrix.
  DeliveryMethodsDto,
  DeliveryMethodsResponse,
  CourierTermsDto,
  PickupPointPublicDto,
  DeliveryPaymentMatrixDto,
  PaymentMethod,
} from "@/shared/api/generated/models";

// A value export, not only a type: the checkout walks the four methods by name.
export { DeliveryMethod } from "@/shared/api/generated/models";

export {
  useSearchDeliveryCities,
  useSearchDeliveryWarehouses,
  useEstimateDelivery,
  useGetDeliveryMethods,
  getGetDeliveryMethodsQueryKey,
} from "@/shared/api/generated/delivery/delivery";
