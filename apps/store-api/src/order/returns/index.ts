// Returns (RMA) — public surface of the sub-module (TASK-340)
export { ReturnService } from './return.service';
export { ReturnRepository } from './return.repository';
export { ReturnController } from './return.controller';
export { AdminReturnController } from './admin-return.controller';
export { ReturnEntity, ReturnItemEntity } from './entities';
export { CreateReturnDto, ResolveReturnDto, ReturnListQueryDto } from './dto';
export {
  RETURN_TRANSITIONS,
  RESTOCK_ON_STATUS,
  allowedReturnTransitions,
  canTransitionReturn,
} from './return-state-machine';
export type { ReturnWithItems, ReturnItemRow, CreateReturnParams } from './return.types';
