import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminFaqTable } from "./faq-list";

// jsdom mounts no app router, and since TASK-357 this table reads page + search
// from the URL and writes them back — so both ends need a stub.
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  usePathname: () => "/faq",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams("");
});

function makeFaqRow(
  id: string,
  question: string,
  isActive: boolean,
  order = 0,
) {
  return {
    id,
    question,
    answer: "Відповідь.",
    sortOrder: order,
    isActive,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * Stub the list and hand back the recorded request URLs, so a test can assert
 * WHAT the table asked for — the TASK-357 bug was never in the response.
 */
function stubFaq(
  rows: ReturnType<typeof makeFaqRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/faq", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? { total: rows.length, page: 1, limit: 20, totalPages: 1 },
      });
    }),
  );
  return requests;
}

describe("AdminFaqTable (TASK-242)", () => {
  it("renders the fetched FAQ items with their status", async () => {
    stubFaq([
      makeFaqRow("faq-1", "Скільки коштує доставка?", true),
      makeFaqRow("faq-2", "Яка гарантія на техніку?", false, 1),
    ]);

    renderWithProviders(<AdminFaqTable />);

    expect(
      await screen.findByText("Скільки коштує доставка?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Яка гарантія на техніку?")).toBeInTheDocument();
    // Active item shows the "shown" badge; inactive shows "hidden".
    expect(screen.getByText(dict.faq.statusActive)).toBeInTheDocument();
    expect(screen.getByText(dict.faq.statusInactive)).toBeInTheDocument();
  });

  it("shows the empty state when there are no items", async () => {
    stubFaq([]);

    renderWithProviders(<AdminFaqTable />);

    expect(await screen.findByText(dict.faq.empty)).toBeInTheDocument();
  });

  it("shows the error state when the request fails", async () => {
    server.use(
      http.get(
        "*/api/admin/faq",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    renderWithProviders(<AdminFaqTable />);

    expect(await screen.findByText(dict.faq.loadError)).toBeInTheDocument();
  });

  // TASK-357: the list used to load unbounded with no page controls and no way
  // to force a refetch.
  describe("toolbar, paging and refresh (TASK-357)", () => {
    it("asks for a bounded page instead of the whole table", async () => {
      const requests = stubFaq([
        makeFaqRow("faq-1", "Скільки коштує доставка?", true),
      ]);

      renderWithProviders(<AdminFaqTable />);
      await screen.findByText("Скільки коштує доставка?");

      expect(requests[0].searchParams.get("limit")).toBe("20");
      expect(requests[0].searchParams.get("page")).toBe("1");
    });

    it("offers page controls when the server reports more than one page", async () => {
      stubFaq([makeFaqRow("faq-1", "Скільки коштує доставка?", true)], {
        total: 55,
        page: 1,
        limit: 20,
        totalPages: 3,
      });

      renderWithProviders(<AdminFaqTable />);
      await screen.findByText("Скільки коштує доставка?");

      expect(screen.getByText(dict.common.pageOf(1, 3))).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.next }),
      );

      expect(mockReplace).toHaveBeenCalledWith("/faq?page=2");
    });

    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubFaq([
        makeFaqRow("faq-1", "Скільки коштує доставка?", true),
      ]);

      renderWithProviders(<AdminFaqTable />);
      await screen.findByText("Скільки коштує доставка?");
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    // An empty page under an active search must not read as "no FAQ items yet".
    it("distinguishes an empty search result from an empty table", async () => {
      mockSearchParams = new URLSearchParams("search=невідоме");
      stubFaq([]);

      renderWithProviders(<AdminFaqTable />);

      expect(
        await screen.findByText(dict.faq.emptyMatch("невідоме")),
      ).toBeInTheDocument();
      expect(screen.queryByText(dict.faq.empty)).not.toBeInTheDocument();
    });
  });
});
