// Cart entity — re-exports generated cart types and API hooks (FSD entities layer).
// Upper layers (widgets/features) import cart data access from here, not from
// the generated client directly.
export type {
  CartEntity,
  CartItemEntity,
  CartTotals,
  AddToCartDto,
  UpdateCartItemDto,
  GetCart200,
  UpdateCartItem200,
  RemoveCartItem200,
  ClearCart200,
  AddToCart201,
} from "@/shared/api/generated/models";

export {
  useGetCart,
  getGetCartQueryKey,
  useUpdateCartItem,
  useRemoveCartItem,
  useClearCart,
  useAddToCart, // exported for the AddToCart feature (TASK-032); CartPage does not use it
} from "@/shared/api/generated/cart/cart";
