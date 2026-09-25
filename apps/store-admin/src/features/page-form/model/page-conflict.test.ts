import { dict } from "@/shared/config";
import { pageSaveConflictMessage } from "./page-conflict";

const conflict = (error: string, status = 409) => ({
  response: { status, data: { error, message: "Slug is already taken" } },
});

describe("pageSaveConflictMessage (TASK-566)", () => {
  it("names the kind whose tab holds the page that owns the address", () => {
    expect(pageSaveConflictMessage(conflict("PAGE_SLUG_TAKEN"), "INFO")).toBe(
      dict.pages.toastSlugTaken(dict.pages.kindInfo),
    );
    expect(pageSaveConflictMessage(conflict("PAGE_SLUG_TAKEN"), "LEGAL")).toBe(
      dict.pages.toastSlugTaken(dict.pages.kindLegal),
    );
    expect(pageSaveConflictMessage(conflict("PAGE_SLUG_TAKEN"), "HUB")).toBe(
      dict.pages.toastSlugTaken(dict.pages.kindHub),
    );
  });

  it("leaves every other failure to the caller's generic toast", () => {
    expect(pageSaveConflictMessage(conflict("REORDER_STALE"), "LEGAL")).toBe(
      undefined,
    );
    expect(
      pageSaveConflictMessage(conflict("PAGE_SLUG_TAKEN", 500), "LEGAL"),
    ).toBe(undefined);
    expect(pageSaveConflictMessage(new Error("network"), "LEGAL")).toBe(
      undefined,
    );
  });
});
