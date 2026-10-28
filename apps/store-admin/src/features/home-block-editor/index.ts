// Homepage block authoring (plan 186, TASK-662): «Додати блок», «Замінити
// карусель…» / «Редагувати вкладки…» and «Запланувати показ…» on /home.
export {
  HomeBlockDialog,
  type HomeBlockDialogProps,
  type HomeBlockDialogTarget,
} from "./ui/home-block-dialog";
export {
  ScheduleHomeBlockDialog,
  type ScheduleHomeBlockDialogProps,
} from "./ui/schedule-home-block-dialog";
export {
  MAX_TABS,
  carouselElsewhere,
  defaultPosition,
  draftFromBlock,
  emptyDraft,
  moveTab,
  positionOptions,
  scheduleError,
  toCreateDto,
  toUpdateDto,
  validateDraft,
  type BlockShow,
  type CreatableBlockType,
  type HomeBlockDraft,
  type HomeBlockDraftErrors,
} from "./model/home-block-form";
