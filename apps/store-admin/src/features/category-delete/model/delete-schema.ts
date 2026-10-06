import { z } from "zod";
import { slugify } from "@/shared/lib";
import { dict } from "@/shared/config";
import type { DeleteCategoryDto } from "@/entities/category";

const d = dict.categories.delete;

/** `DeleteCategoryMoveToNewDto.name` — `@MaxLength(255)` on the API. */
export const NEW_NAME_MAX_LENGTH = 255;

/** «В існуючу категорію» / «Створити нову» (ДН-2.2 / ДН-2.5). */
export type DeleteMode = "existing" | "new";

/**
 * The dialog's fields. ALL of them always exist (forms.md Rule 4c), whichever
 * mode is on screen: switching the segment must not lose what was typed in the
 * other one, and an absent field would let zod answer in English.
 */
export interface CategoryDeleteFormValues {
  mode: DeleteMode;
  /** The existing target; `""` = not picked yet. */
  targetId: string;
  /** The new target's name. */
  name: string;
  /** The new target's parent; `""` = the root of the catalogue. */
  parentId: string;
}

export const CATEGORY_DELETE_DEFAULTS: CategoryDeleteFormValues = {
  mode: "existing",
  targetId: "",
  name: "",
  parentId: "",
};

/**
 * The rules depend on what is being deleted: an EMPTY category (ДН-2.9) asks
 * nothing, so nothing is validated; otherwise exactly the visible mode's
 * fields are. The server re-checks every one of them under its locks — this is
 * only what can be said before the round trip.
 */
export function makeCategoryDeleteSchema(isEmpty: boolean) {
  return z
    .object({
      mode: z.enum(["existing", "new"]),
      targetId: z.string(),
      name: z.string(),
      parentId: z.string(),
    })
    .superRefine((values, ctx) => {
      if (isEmpty) return;
      if (values.mode === "existing") {
        if (!values.targetId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["targetId"],
            message: d.targetRequired,
          });
        }
        return;
      }
      const name = values.name.trim();
      if (!name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: d.newNameRequired,
        });
      } else if (name.length > NEW_NAME_MAX_LENGTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: d.newNameTooLong,
        });
      } else if (!slugify(name)) {
        // The API derives the slug from the name and refuses an empty one
        // (`category.service.ts`, 400) — say it here, under the field.
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: d.newNameNoLetters,
        });
      }
    });
}

/**
 * The request body for the chosen mode. An empty category sends `{}` — the
 * target-less delete of TASK-655 (ДН-2.9); the root parent is simply omitted.
 */
export function toDeleteCategoryDto(
  values: CategoryDeleteFormValues,
  isEmpty: boolean,
): DeleteCategoryDto {
  if (isEmpty) return {};
  if (values.mode === "existing") return { moveToId: values.targetId };
  const name = values.name.trim();
  return {
    moveToNew: values.parentId ? { name, parentId: values.parentId } : { name },
  };
}
