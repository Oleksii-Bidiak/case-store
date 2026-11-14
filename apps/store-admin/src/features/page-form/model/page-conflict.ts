import type { UseFormSetError } from "react-hook-form";
import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import {
  applyServerFieldErrors,
  type ServerFieldMap,
} from "@/shared/lib/form-errors";
import type { PageFormInput, PageKindValue } from "./page-schema";

/** The API's code for "another page of this kind already has this address". */
const PAGE_SLUG_TAKEN = "PAGE_SLUG_TAKEN";

const KIND_LABEL: Record<PageKindValue, string> = {
  LEGAL: dict.pages.kindLegal,
  INFO: dict.pages.kindInfo,
  HUB: dict.pages.kindHub,
};

/** `CreatePageDto` / `UpdatePageDto` paths → form fields (TASK-1984, Rule 6b). */
export const PAGE_FIELD_MAP: ServerFieldMap = {
  title: "title",
  slug: "slug",
  content: "content",
  excerpt: "excerpt",
  metaTitle: "metaTitle",
  metaDescription: "metaDescription",
  keywords: "keywords",
  "keywords.*": "keywords",
  ogImage: "ogImage",
  scheduledAt: "scheduledAt",
};

export type PageFormSetError = UseFormSetError<PageFormInput>;

/**
 * The words for a save the API refused because the address is taken, or
 * `undefined` for any other failure (TASK-566).
 *
 * A slug is unique within its kind, so the page that owns it is always on the
 * tab of the kind being saved — the sentence names that tab. Before, the panel
 * said only «Не вдалося зберегти», and the API's «Slug is already taken» had
 * operators searching the Юридичні tab for a row that lived under Хаби.
 */
export function pageSaveConflictMessage(
  error: unknown,
  kind: PageKindValue,
): string | undefined {
  if (apiErrorStatus(error) !== 409) return undefined;
  if (apiErrorCode(error) !== PAGE_SLUG_TAKEN) return undefined;
  return dict.pages.toastSlugTaken(KIND_LABEL[kind]);
}

/**
 * Puts a refused page save under its field (TASK-1984, Rule 6b) and says
 * whether it did — `false` leaves the toast to the caller. The 409
 * `PAGE_SLUG_TAKEN` goes under the slug, in the words that name the tab.
 */
export function placePageSaveError(
  error: unknown,
  kind: PageKindValue,
  setError: PageFormSetError,
): boolean {
  const slugTaken = pageSaveConflictMessage(error, kind);
  if (slugTaken) {
    setError(
      "slug",
      { type: "server", message: slugTaken },
      { shouldFocus: true },
    );
    return true;
  }
  if (apiErrorStatus(error) !== 400) return false;
  const { mapped, unmapped } = applyServerFieldErrors<PageFormInput>(
    error,
    setError,
    PAGE_FIELD_MAP,
  );
  return mapped.length > 0 && unmapped.length === 0;
}
