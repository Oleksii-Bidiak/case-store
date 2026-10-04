// Author-level review moderation (TASK-446) — withdraw or restore one account's
// entire contribution, gated on `reviews:moderate` and behind a confirm. Wave
// 198 (TASK-1057): the confirm is exported on its own, controlled, so the queue
// can open it from a row's «⋯» menu.
export {
  ReviewAuthorModerationAction,
  ReviewAuthorModerationDialog,
  authorModerationMode,
  type AuthorModerationMode,
} from "./ui/review-author-moderation-action";
