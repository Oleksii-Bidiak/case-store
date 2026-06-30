// Discount Module — public API
export { DiscountModule } from './discount.module';
export { DiscountService } from './discount.service';
export { DiscountController } from './discount.controller';
export { AdminDiscountController } from './admin-discount.controller';
export { DiscountRepository } from './discount.repository';
export type {
  CreateDiscountInput,
  UpdateDiscountInput,
  FindManyParams as DiscountFindManyParams,
  PaginatedDiscountsResult,
} from './discount.repository';
export { DiscountEntity, DiscountPreviewEntity } from './entities';
export {
  CreateDiscountDto,
  UpdateDiscountDto,
  DiscountListQueryDto,
  PreviewDiscountDto,
} from './dto';
export { DiscountErrorCode } from './discount.errors';
