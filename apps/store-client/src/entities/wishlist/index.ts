// Wishlist entity — re-exports generated wishlist types and API hooks (FSD
// entities layer). Upper layers (widgets/features) import wishlist data access
// from here, not from the generated client directly.
export type {
  WishlistEntity,
  WishlistItemEntity,
  AddToWishlistDto,
  GetWishlist200,
  AddToWishlist201,
  ToggleWishlist201,
  RemoveFromWishlist200,
} from "@/shared/api/generated/models";

export {
  useGetWishlist,
  getGetWishlistQueryKey,
  useAddToWishlist,
  useToggleWishlist,
  useRemoveFromWishlist,
} from "@/shared/api/generated/wishlist/wishlist";
