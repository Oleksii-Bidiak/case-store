// Discount entity — re-exports generated discount types and API hooks (FSD
// entities layer). Upper layers (features) import the preview hook from here,
// not from the generated client directly.
export type {
  DiscountPreviewEntity,
  DiscountPreviewResponseEnvelope,
  PreviewDiscountDto,
  // Public active-discounts feed (TASK-179).
  PublicDiscountEntity,
  PublicDiscountEntityType,
} from "@/shared/api/generated/models";

export {
  usePreviewDiscount,
  // Live promo feed for the storefront /promo page (TASK-179).
  useListActiveDiscounts,
} from "@/shared/api/generated/discounts/discounts";
