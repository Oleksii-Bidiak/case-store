import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { server } from "@/shared/test/msw-server";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { dict } from "@/shared/config";
import { SearchIndexView } from "./search-index-view";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const d = dict.searchIndex;
const REINDEX_URL = "*/api/admin/search/reindex";

describe("SearchIndexView (TASK-377)", () => {
  // The `sonner` mock lives at module scope, so its call log survives across
  // tests unless it is cleared — which would let a previous test's success toast
  // satisfy an assertion here.
  beforeEach(() => jest.clearAllMocks());

  it("explains when a rebuild is needed and offers the action", () => {
    renderWithProviders(<SearchIndexView />);

    expect(screen.getByText(d.heading)).toBeInTheDocument();
    expect(screen.getByText(d.whenHeading)).toBeInTheDocument();
    // The operator is told the rebuild is not destructive — otherwise the safe
    // repair reads as the risky one and never gets used.
    expect(screen.getByText(d.safetyNote)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: d.button })).toBeEnabled();
  });

  it("reindexes and reports how many products were indexed", async () => {
    server.use(
      http.post(REINDEX_URL, () =>
        HttpResponse.json({ data: { indexed: 178 } }),
      ),
    );
    renderWithProviders(<SearchIndexView />);

    await userEvent.click(screen.getByRole("button", { name: d.button }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(d.toastDone(178)),
    );
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
