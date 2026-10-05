// Discount Module — public API
export { DiscountModule } from './discount.module';
export { DiscountService } from './discount.service';
// `DiscountRepository` is deliberately NOT exported (TASK-818): it is not in
// `DiscountModule.exports`, and a caller holding it could write a discount past
// the service's usage-cap and validity checks.
export { DiscountEntity, DiscountPreviewEntity, PublicDiscountEntity } from './entities';
export {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountListQueryDto,
  PreviewDiscountDto,
} from './dto';
export { DiscountErrorCode, badDiscount, conflictDiscount } from './discount.errors';
