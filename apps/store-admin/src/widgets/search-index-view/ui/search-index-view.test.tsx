import { http, HttpResponse } from "msw";
import { toast } from "@/shared/ui/toast";
import { server } from "@/shared/test/msw-server";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { SearchIndexView } from "./search-index-view";

jest.mock("@/shared/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const d = dict.searchIndex;
const REINDEX_URL = "*/api/admin/search/reindex";

const SYNONYMS_URL = "*/api/admin/search/synonyms";

/** The synonym section (TASK-559) loads on the same screen. */
function stubSynonyms(
  body: Record<string, unknown> = {
    data: { isDefault: true, groups: [{ terms: ["чохол", "case"] }] },
  },
  status = 200,
) {
  server.use(http.get(SYNONYMS_URL, () => HttpResponse.json(body, { status })));
}

describe("SearchIndexView (TASK-377)", () => {
  // The toast mock lives at module scope, so its call log survives across
  // tests unless it is cleared — which would let a previous test's success toast
  // satisfy an assertion here.
  beforeEach(() => {
    jest.clearAllMocks();
    stubSynonyms();
  });

  it("explains when a rebuild is needed and offers the action", () => {
    renderWithProviders(<SearchIndexView />);

    expect(screen.getByText(d.heading)).toBeInTheDocument();
    expect(screen.getByText(d.whenHeading)).toBeInTheDocument();
    // The operator is told the rebuild is not destructive — otherwise the safe
    // repair reads as the risky one and never gets used.
    expect(screen.getByText(d.safetyNote)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.button })).toBeEnabled();
  });

  it("reindexes and reports how many products and articles were indexed", async () => {
    // TASK-525 — the rebuild covers the blog index too; its count is shown so
    // an empty blog index is visible rather than hidden behind the products.
    server.use(
      http.post(REINDEX_URL, () =>
        HttpResponse.json({ data: { indexed: 178, blogPosts: 12 } }),
      ),
    );
    renderWithProviders(<SearchIndexView />);

    await userEvent.click(screen.getByRole("button", { name: d.button }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(d.toastDone(178, 12)),
    );
    expect(d.toastDone(178, 12)).toContain("12");
  });

  it("surfaces a failure instead of pretending it worked", async () => {
    server.use(
      http.post(REINDEX_URL, () => new HttpResponse(null, { status: 500 })),
    );
    renderWithProviders(<SearchIndexView />);

    await userEvent.click(screen.getByRole("button", { name: d.button }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(d.toastFailed),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe("SearchIndexView — synonyms section (TASK-559)", () => {
  const s = dict.searchSynonyms;

  beforeEach(() => jest.clearAllMocks());

  it("loads the list into the form, one row per group", async () => {
    stubSynonyms({
      data: {
        isDefault: false,
        groups: [{ terms: ["чохол", "case"] }, { terms: ["айфон", "iphone"] }],
      },
    });
    renderWithProviders(<SearchIndexView />);

    expect(
      screen.getByRole("heading", { name: s.heading }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText(s.termsLabel(1))).toHaveValue(
      "чохол, case",
    );
    expect(screen.getByLabelText(s.termsLabel(2))).toHaveValue("айфон, iphone");
  });

  it("says when the built-in list is in force", async () => {
    stubSynonyms();
    renderWithProviders(<SearchIndexView />);

    expect(await screen.findByText(s.defaultNote)).toBeInTheDocument();
    // Nothing to restore while the defaults ARE the list.
    expect(
      screen.queryByRole("button", { name: s.restoreDefaults }),
    ).not.toBeInTheDocument();
  });

  it("shows an error instead of an empty form when the list cannot load", async () => {
    stubSynonyms({}, 500);
    renderWithProviders(<SearchIndexView />);

    expect(await screen.findByText(s.loadError)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: s.submit }),
    ).not.toBeInTheDocument();
  });
});
