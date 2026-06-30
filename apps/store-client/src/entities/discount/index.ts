// Discount entity — re-exports generated discount types and API hooks (FSD
// entities layer). Upper layers (features) import the preview hook from here,
// not from the generated client directly.
export type {
  DiscountPreviewEntity,
  DiscountPreviewResponseEnvelope,
  PreviewDiscountDto,
} from "@/shared/api/generated/models";

export { usePreviewDiscount } from "@/shared/api/generated/discounts/discounts";
