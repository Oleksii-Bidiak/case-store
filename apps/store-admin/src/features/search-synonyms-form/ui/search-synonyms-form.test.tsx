import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { toast } from "@/shared/ui/toast";
import type { SearchSynonymsEntity } from "@/entities/search-synonyms";
import { SearchSynonymsForm } from "./search-synonyms-form";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const s = dict.searchSynonyms;
const URL = "*/api/admin/search/synonyms";

const SAVED: SearchSynonymsEntity = {
  isDefault: false,
  groups: [{ terms: ["чохол", "case"] }, { terms: ["айфон", "iphone"] }],
};

/** Stub the PUT, echoing the normalised list back like the API does. */
function stubSave(
  answer: (body: { groups: Array<{ terms: string[] }> }) => Response = (body) =>
    HttpResponse.json({
      data: {
        groups: body.groups,
        isDefault: body.groups.length === 0,
        appliedToSearch: true,
      },
    }),
) {
  const bodies: Array<{ groups: Array<{ terms: string[] }> }> = [];
  server.use(
    http.put(URL, async ({ request }) => {
      const body = (await request.json()) as {
        groups: Array<{ terms: string[] }>;
      };
      bodies.push(body);
      return answer(body);
    }),
  );
  return bodies;
}

// TASK-1053 (Н3): groups are chips in a grid; a group is edited through its
// «⋯» → «Змінити», which turns its card into the comma-separated input.
const groupList = () => screen.getByRole("list", { name: s.heading });
const row = (n: number) =>
  screen.getByRole("textbox", { name: s.termsLabel(n) });
const groupMenu = async (n: number, item: string) => {
  await userEvent.click(
    screen.getByRole("button", { name: s.groupActionsAria(n) }),
  );
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
};
const editRow = async (n: number) => {
  await groupMenu(n, s.editGroup);
  return row(n);
};
const removeRow = (n: number) => groupMenu(n, s.removeGroup);
const restoreDefaults = async () => {
  await userEvent.click(
    screen.getByRole("button", { name: s.sectionMenuAria }),
  );
  await userEvent.click(
    screen.getByRole("menuitem", { name: s.restoreDefaults }),
  );
};
/** What each group card holds: its input's value while edited, else its chips. */
const groupValues = () =>
  within(groupList())
    .getAllByRole("listitem")
    .map((item) => {
      const input = item.querySelector("input");
      if (input) return input.value;
      return Array.from(item.querySelectorAll("[data-slot='synonym-chip']"))
        .map((chip) => chip.textContent)
        .join(", ");
    });

const submit = () =>
  userEvent.click(screen.getByRole("button", { name: s.submit }));

describe("SearchSynonymsForm (TASK-559)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("seeds one group per saved group, its words as chips", () => {
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    expect(groupValues()).toEqual(["чохол, case", "айфон, iphone"]);
  });

  describe("state sync with the query (forms.md Rule 2)", () => {
    const REFETCHED: SearchSynonymsEntity = {
      isDefault: false,
      groups: [
        { terms: ["чохол", "case", "кейс"] },
        { terms: ["айфон", "iphone", "ifone"] },
        { terms: ["скло", "glass"] },
      ],
    };

    it("shows a refetched list while the form is untouched", async () => {
      const { rerender } = renderWithProviders(
        <SearchSynonymsForm settings={SAVED} />,
      );

      rerender(<SearchSynonymsForm settings={REFETCHED} />);

      await waitFor(() =>
        expect(groupValues()).toEqual([
          "чохол, case, кейс",
          "айфон, iphone, ifone",
          "скло, glass",
        ]),
      );
    });

    it("keeps the operator's edit when the list is refetched, and saves their list", async () => {
      const bodies = stubSave();
      const { rerender } = renderWithProviders(
        <SearchSynonymsForm settings={SAVED} />,
      );
      const first = await editRow(1);
      await userEvent.clear(first);
      await userEvent.type(first, "чохол, бампер");

      rerender(<SearchSynonymsForm settings={REFETCHED} />);

      // The WHOLE list stays as the operator left it — not a per-row merge,
      // which would refresh row 2 and silently drop the refetch's third group.
      expect(groupValues()).toEqual(["чохол, бампер", "айфон, iphone"]);

      await submit();
      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toEqual({
        groups: [
          { terms: ["чохол", "бампер"] },
          { terms: ["айфон", "iphone"] },
        ],
      });
    });

    it("keeps a removed row removed when the list is refetched", async () => {
      const { rerender } = renderWithProviders(
        <SearchSynonymsForm settings={SAVED} />,
      );
      await removeRow(1);

      rerender(<SearchSynonymsForm settings={REFETCHED} />);

      expect(groupValues()).toEqual(["айфон, iphone"]);
    });

    it("keeps an added row when the list is refetched", async () => {
      const { rerender } = renderWithProviders(
        <SearchSynonymsForm settings={SAVED} />,
      );
      await userEvent.click(screen.getByRole("button", { name: s.addGroup }));
      await userEvent.type(row(3), "гаджет, gadget");

      rerender(<SearchSynonymsForm settings={REFETCHED} />);

      expect(groupValues()).toEqual([
        "чохол, case",
        "айфон, iphone",
        "гаджет, gadget",
      ]);
    });
  });

  it("adds a group, saves the normalised list and shows what was stored", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.click(screen.getByRole("button", { name: s.addGroup }));
    // The new group opens as an input, ready to type into.
    expect(row(3)).toHaveFocus();
    await userEvent.type(row(3), " Гаджет ,GADGET, гаджет");
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      groups: [
        { terms: ["чохол", "case"] },
        { terms: ["айфон", "iphone"] },
        { terms: ["гаджет", "gadget"] },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith(s.toastSaved);
    // Re-seeded from the server's answer: the typed line comes back normalised.
    await waitFor(() => expect(groupValues()[2]).toBe("гаджет, gadget"));
  });

  it("removes a group", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await removeRow(1);
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ groups: [{ terms: ["айфон", "iphone"] }] });
  });

  it("shows the error under the row and sends nothing", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    const second = await editRow(2);
    await userEvent.clear(second);
    await userEvent.type(second, "type-c, typec");
    await submit();

    expect(
      await screen.findByText(s.errors.notOneWord("type-c")),
    ).toBeInTheDocument();
    expect(row(2)).toHaveAttribute("aria-invalid", "true");
    expect(bodies).toHaveLength(0);
  });

  it("restores the built-in list only after confirmation", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await restoreDefaults();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(s.restoreDescription)).toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: s.restoreConfirm }),
    );

    await waitFor(() => expect(bodies).toEqual([{ groups: [] }]));
    expect(toast.success).toHaveBeenCalledWith(s.toastRestored);
  });

  it("keeps the list when the confirmation is cancelled", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await restoreDefaults();
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
  });

  it("has nothing to restore while the built-in list is in force", () => {
    renderWithProviders(
      <SearchSynonymsForm settings={{ ...SAVED, isDefault: true }} />,
    );

    expect(
      screen.queryByRole("button", { name: s.sectionMenuAria }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(s.defaultNote)).toBeInTheDocument();
  });

  it("saving with every group removed asks first — it restores the built-in list", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await removeRow(2);
    await removeRow(1);
    expect(screen.getByText(s.empty)).toBeInTheDocument();
    await submit();

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(s.emptySaveDescription),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
    await userEvent.click(
      within(dialog).getByRole("button", { name: s.restoreConfirm }),
    );

    await waitFor(() => expect(bodies).toEqual([{ groups: [] }]));
    expect(toast.success).toHaveBeenCalledWith(s.toastRestored);
    expect(toast.success).not.toHaveBeenCalledWith(s.toastSaved);
  });

  it("saving only blank rows, then cancelling, sends nothing", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.clear(await editRow(1));
    await userEvent.clear(await editRow(2));
    await submit();

    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says so on screen when the search engine did not take the list", async () => {
    stubSave((body) =>
      HttpResponse.json({
        data: { groups: body.groups, isDefault: false, appliedToSearch: false },
      }),
    );
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await submit();

    expect(await screen.findByText(s.notApplied)).toBeInTheDocument();
  });

  it("toasts the API's message on a failed save", async () => {
    stubSave(() =>
      HttpResponse.json(
        {
          statusCode: 400,
          error: "Bad Request",
          message: ["Each synonym must be a single word"],
        },
        { status: 400 },
      ),
    );
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await submit();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Each synonym must be a single word",
      ),
    );
  });
});

describe("SearchSynonymsForm — chip grid by mockup Н3 (TASK-1053)", () => {
  const MANY: SearchSynonymsEntity = {
    isDefault: false,
    groups: Array.from({ length: 15 }, (_, i) => ({
      terms: [`слово${i + 1}`, `word${i + 1}`],
    })),
  };

  beforeEach(() => jest.clearAllMocks());

  it("counts the groups in the header", () => {
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    expect(screen.getByText(s.countHint(2))).toBeInTheDocument();
  });

  it("shows the first twelve groups and the rest on «показати всі»", async () => {
    renderWithProviders(<SearchSynonymsForm settings={MANY} />);

    expect(within(groupList()).getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByText(s.shownOf(12, 15))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: s.showAll }));

    expect(within(groupList()).getAllByRole("listitem")).toHaveLength(15);
    expect(
      screen.queryByRole("button", { name: s.showAll }),
    ).not.toBeInTheDocument();
  });

  it("finds the groups holding a word", async () => {
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.type(
      screen.getByRole("searchbox", { name: s.searchAria }),
      "айф",
    );

    expect(groupValues()).toEqual(["айфон, iphone"]);
    expect(screen.getByText(s.shownOf(1, 2))).toBeInTheDocument();
  });

  it("says so when no group holds the word", async () => {
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.type(
      screen.getByRole("searchbox", { name: s.searchAria }),
      "xyz",
    );

    expect(screen.getByText(s.noMatches("xyz"))).toBeInTheDocument();
  });

  it("does not submit the form on Enter in the word search", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.type(
      screen.getByRole("searchbox", { name: s.searchAria }),
      "чох{Enter}",
    );

    expect(bodies).toHaveLength(0);
  });

  it("lists the unsaved groups in the sticky bar and discards them", async () => {
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await removeRow(1);
    await userEvent.click(screen.getByRole("button", { name: s.addGroup }));
    await userEvent.type(row(2), "скло, glass");

    expect(
      screen.getByText(dict.canon.unsavedChanges(s.dirtyLabel(1))),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: dict.canon.discardChanges }),
    );

    expect(groupValues()).toEqual(["чохол, case", "айфон, iphone"]);
    expect(screen.queryByText(/Незбережені зміни/)).not.toBeInTheDocument();
  });

  it("«Готово» folds an edited group back to chips", async () => {
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    const first = await editRow(1);
    await userEvent.type(first, ", кейс");
    await userEvent.click(screen.getByRole("button", { name: s.doneEditing }));

    expect(
      screen.queryByRole("textbox", { name: s.termsLabel(1) }),
    ).not.toBeInTheDocument();
    expect(groupValues()[0]).toBe("чохол, case, кейс");
  });
});
