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

const row = (n: number) => screen.getByLabelText(s.termsLabel(n));
const submit = () =>
  userEvent.click(screen.getByRole("button", { name: s.submit }));

describe("SearchSynonymsForm (TASK-559)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("seeds one comma-separated row per group", () => {
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    expect(row(1)).toHaveValue("чохол, case");
    expect(row(2)).toHaveValue("айфон, iphone");
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

      await waitFor(() => expect(row(1)).toHaveValue("чохол, case, кейс"));
      expect(row(2)).toHaveValue("айфон, iphone, ifone");
      expect(row(3)).toHaveValue("скло, glass");
    });

    const rowValues = () =>
      screen
        .getAllByRole("textbox")
        .map((input) => (input as HTMLInputElement).value);

    it("keeps the operator's edit when the list is refetched, and saves their list", async () => {
      const bodies = stubSave();
      const { rerender } = renderWithProviders(
        <SearchSynonymsForm settings={SAVED} />,
      );
      await userEvent.clear(row(1));
      await userEvent.type(row(1), "чохол, бампер");

      rerender(<SearchSynonymsForm settings={REFETCHED} />);

      // The WHOLE list stays as the operator left it — not a per-row merge,
      // which would refresh row 2 and silently drop the refetch's third group.
      expect(rowValues()).toEqual(["чохол, бампер", "айфон, iphone"]);

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
      await userEvent.click(
        screen.getByRole("button", { name: s.removeGroupAria(1) }),
      );

      rerender(<SearchSynonymsForm settings={REFETCHED} />);

      expect(rowValues()).toEqual(["айфон, iphone"]);
    });

    it("keeps an added row when the list is refetched", async () => {
      const { rerender } = renderWithProviders(
        <SearchSynonymsForm settings={SAVED} />,
      );
      await userEvent.click(screen.getByRole("button", { name: s.addGroup }));
      await userEvent.type(row(3), "гаджет, gadget");

      rerender(<SearchSynonymsForm settings={REFETCHED} />);

      expect(rowValues()).toEqual([
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
    await waitFor(() => expect(row(3)).toHaveValue("гаджет, gadget"));
  });

  it("removes a group", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.click(
      screen.getByRole("button", { name: s.removeGroupAria(1) }),
    );
    await submit();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ groups: [{ terms: ["айфон", "iphone"] }] });
  });

  it("shows the error under the row and sends nothing", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.clear(row(2));
    await userEvent.type(row(2), "type-c, typec");
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

    await userEvent.click(
      screen.getByRole("button", { name: s.restoreDefaults }),
    );
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

    await userEvent.click(
      screen.getByRole("button", { name: s.restoreDefaults }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: dict.common.cancel }),
    );

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(bodies).toHaveLength(0);
  });

  it("saving with every group removed asks first — it restores the built-in list", async () => {
    const bodies = stubSave();
    renderWithProviders(<SearchSynonymsForm settings={SAVED} />);

    await userEvent.click(
      screen.getByRole("button", { name: s.removeGroupAria(2) }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: s.removeGroupAria(1) }),
    );
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

    await userEvent.clear(row(1));
    await userEvent.clear(row(2));
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
