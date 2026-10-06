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
  SelectCartItemAddon201,
  DeselectCartItemAddon200,
} from "@/shared/api/generated/models";

export {
  useGetCart,
  getGetCartQueryKey,
  useUpdateCartItem,
  useRemoveCartItem,
  useClearCart,
  useAddToCart, // exported for the AddToCart feature (TASK-032); CartPage does not use it
  // Add-on selection (TASK-174) — consumed by features/cart-addon-toggle.
  useSelectCartItemAddon,
  useDeselectCartItemAddon,
  // The raw DELETE (TASK-657) — features/cart-remove-unavailable awaits it once
  // per withdrawn line in a plain loop, so N lines make one refetch and one
  // toast instead of N mutation observers each invalidating on its own.
  removeCartItem,
} from "@/shared/api/generated/cart/cart";
