// Review reply (TASK-446) — the shop's public answer to one review, gated on
// the `reviews:write` permission. Wave 198 (TASK-1057): the dialog is exported
// on its own, controlled, so the queue can open it from a row's «⋯» menu.
export {
  REPLY_MAX_LENGTH,
  ReviewReplyAction,
  ReviewReplyDialog,
} from "./ui/review-reply-action";
