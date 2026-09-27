import { dict } from "@/shared/config";
import { apiErrorCode, apiErrorStatus } from "@/shared/lib";
import type { PageKindValue } from "./page-schema";

/** The API's code for "another page of this kind already has this address". */
const PAGE_SLUG_TAKEN = "PAGE_SLUG_TAKEN";

const KIND_LABEL: Record<PageKindValue, string> = {
  LEGAL: dict.pages.kindLegal,
  INFO: dict.pages.kindInfo,
  HUB: dict.pages.kindHub,
};

/**
 * The toast for a save the API refused because the address is taken, or
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
