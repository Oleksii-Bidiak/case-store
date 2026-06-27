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
} from "@/shared/api/generated/models";

export {
  useSearchDeliveryCities,
  useSearchDeliveryWarehouses,
  useEstimateDelivery,
} from "@/shared/api/generated/delivery/delivery";
