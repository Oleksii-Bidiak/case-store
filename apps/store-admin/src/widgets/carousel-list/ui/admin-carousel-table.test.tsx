import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { AdminCarouselTable } from "./admin-carousel-table";

// jsdom mounts no app router, and since TASK-357 this table reads page + search
// from the URL and writes them back — so both ends need a stub.
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams("");
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
  usePathname: () => "/carousels",
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  mockPush.mockClear();
  mockSearchParams = new URLSearchParams("");
});

type Source = "BESTSELLING" | "NEWEST" | "ON_SALE" | "CATEGORY" | "MANUAL";
type Status = "DRAFT" | "SCHEDULED" | "PUBLISHED";
type Placement = "HOME_TABS" | "HOME_RAILS";

function makeCarouselRow(
  id: string,
  title: string,
  source: Source,
  status: Status,
  placement: Placement = "HOME_RAILS",
) {
  return {
    id,
    title,
    source,
    placement,
    categoryId: null,
    itemLimit: 12,
    sortOrder: 0,
    status,
    publishedAt: status === "PUBLISHED" ? "2026-07-01T00:00:00.000Z" : null,
    scheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
}

/**
 * Stub the list and hand back the recorded request URLs, so a test can assert
 * WHAT the table asked for — the TASK-357 bug was never in the response.
 */
function stubCarousels(
  rows: ReturnType<typeof makeCarouselRow>[],
  meta?: { total: number; page: number; limit: number; totalPages: number },
) {
  const requests: URL[] = [];
  server.use(
    http.get("*/api/admin/carousels", ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json({
        data: rows,
        meta: meta ?? {
          total: rows.length,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
    }),
  );
  return requests;
}

describe("AdminCarouselTable", () => {
  it("renders carousel rows with source and status badges", async () => {
    stubCarousels([
      makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
      makeCarouselRow("carousel-2", "Редакція обирає", "MANUAL", "DRAFT"),
    ]);

    renderWithProviders(<AdminCarouselTable />);

    expect(await screen.findByText("Хіти тижня")).toBeInTheDocument();
    expect(screen.getByText("Редакція обирає")).toBeInTheDocument();
    expect(
      screen.getByText(dict.carousels.sourceLabels.BESTSELLING),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.carousels.sourceLabels.MANUAL),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.carousels.statusLabels.PUBLISHED),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.carousels.statusLabels.DRAFT),
    ).toBeInTheDocument();
  });

  // TASK-288: the operator must be able to tell a home tab from a rail at a glance.
  it("renders a placement badge per row", async () => {
    stubCarousels([
      makeCarouselRow(
        "carousel-1",
        "Хіти тижня",
        "BESTSELLING",
        "PUBLISHED",
        "HOME_TABS",
      ),
      makeCarouselRow(
        "carousel-2",
        "Редакція обирає",
        "MANUAL",
        "DRAFT",
        "HOME_RAILS",
      ),
    ]);

    renderWithProviders(<AdminCarouselTable />);

    expect(
      await screen.findByText(dict.carousels.placementLabels.HOME_TABS),
    ).toBeInTheDocument();
    expect(
      screen.getByText(dict.carousels.placementLabels.HOME_RAILS),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", {
        name: dict.carousels.colPlacement,
      }),
    ).toBeInTheDocument();
  });

  it("renders an edit action linking to the carousel edit route", async () => {
    stubCarousels([
      makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
    ]);

    renderWithProviders(<AdminCarouselTable />);

    const editLink = await screen.findByRole("link", {
      name: dict.common.edit,
    });
    expect(editLink).toHaveAttribute("href", "/carousels/carousel-1/edit");
  });

  it("shows the empty state when there are no carousels", async () => {
    stubCarousels([]);

    renderWithProviders(<AdminCarouselTable />);

    expect(await screen.findByText(dict.carousels.empty)).toBeInTheDocument();
  });

  it("publishes a draft via the toggle and PATCHes the publish endpoint", async () => {
    stubCarousels([
      makeCarouselRow("carousel-2", "Редакція обирає", "MANUAL", "DRAFT"),
    ]);
    let published = false;
    server.use(
      http.patch("*/api/admin/carousels/carousel-2/publish", () => {
        published = true;
        return HttpResponse.json({
          data: makeCarouselRow(
            "carousel-2",
            "Редакція обирає",
            "MANUAL",
            "PUBLISHED",
          ),
        });
      }),
    );

    renderWithProviders(<AdminCarouselTable />);

    await userEvent.click(
      await screen.findByRole("button", { name: dict.carousels.publish }),
    );

    await waitFor(() => expect(published).toBe(true));
  });

  it("unpublishes a published carousel via the toggle", async () => {
    stubCarousels([
      makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
    ]);
    let unpublished = false;
    server.use(
      http.patch("*/api/admin/carousels/carousel-1/unpublish", () => {
        unpublished = true;
        return HttpResponse.json({
          data: makeCarouselRow(
            "carousel-1",
            "Хіти тижня",
            "BESTSELLING",
            "DRAFT",
          ),
        });
      }),
    );

    renderWithProviders(<AdminCarouselTable />);

    await userEvent.click(
      await screen.findByRole("button", { name: dict.carousels.unpublish }),
    );

    await waitFor(() => expect(unpublished).toBe(true));
  });

  describe("delete with confirm", () => {
    let confirmSpy: jest.SpyInstance;

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it("deletes after the admin confirms", async () => {
      confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
      stubCarousels([
        makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
      ]);
      let deleted = false;
      server.use(
        http.delete("*/api/admin/carousels/carousel-1", () => {
          deleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      renderWithProviders(<AdminCarouselTable />);

      await userEvent.click(
        await screen.findByRole("button", { name: dict.common.delete }),
      );

      expect(confirmSpy).toHaveBeenCalledWith(
        dict.carousels.deleteConfirm("Хіти тижня"),
      );
      await waitFor(() => expect(deleted).toBe(true));
    });

    it("does nothing when the admin cancels the confirm", async () => {
      confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(false);
      stubCarousels([
        makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
      ]);
      let deleted = false;
      server.use(
        http.delete("*/api/admin/carousels/carousel-1", () => {
          deleted = true;
          return new HttpResponse(null, { status: 204 });
        }),
      );

      renderWithProviders(<AdminCarouselTable />);

      await userEvent.click(
        await screen.findByRole("button", { name: dict.common.delete }),
      );

      expect(confirmSpy).toHaveBeenCalled();
      // Give any (wrong) mutation a beat to fire before asserting it did not.
      await waitFor(() => expect(deleted).toBe(false));
    });
  });

  // TASK-357: this table used to read the WHOLE carousel set with no page
  // controls and no way to force a refetch.
  describe("toolbar, paging and refresh (TASK-357)", () => {
    it("asks for a bounded page instead of the whole table", async () => {
      const requests = stubCarousels([
        makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
      ]);

      renderWithProviders(<AdminCarouselTable />);
      await screen.findByText("Хіти тижня");

      expect(requests[0].searchParams.get("limit")).toBe("20");
      expect(requests[0].searchParams.get("page")).toBe("1");
    });

    it("offers page controls when the server reports more than one page", async () => {
      stubCarousels(
        [
          makeCarouselRow(
            "carousel-1",
            "Хіти тижня",
            "BESTSELLING",
            "PUBLISHED",
          ),
        ],
        { total: 42, page: 1, limit: 20, totalPages: 3 },
      );

      renderWithProviders(<AdminCarouselTable />);
      await screen.findByText("Хіти тижня");

      expect(screen.getByText(dict.common.pageOf(1, 3))).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: dict.common.previous }),
      ).toBeDisabled();

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.next }),
      );

      expect(mockPush).toHaveBeenCalledWith("/carousels?page=2");
    });

    it("refetches on demand — the point of the refresh control", async () => {
      const requests = stubCarousels([
        makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
      ]);

      renderWithProviders(<AdminCarouselTable />);
      await screen.findByText("Хіти тижня");
      expect(requests).toHaveLength(1);

      await userEvent.click(
        screen.getByRole("button", { name: dict.common.table.refreshAria }),
      );

      await waitFor(() => expect(requests).toHaveLength(2));
    });

    it("submits the search into the URL and resets the page", async () => {
      mockSearchParams = new URLSearchParams("page=3");
      stubCarousels([
        makeCarouselRow("carousel-1", "Хіти тижня", "BESTSELLING", "PUBLISHED"),
      ]);

      renderWithProviders(<AdminCarouselTable />);
      await screen.findByText("Хіти тижня");

      await userEvent.type(
        screen.getByLabelText(dict.carousels.searchAria),
        "хіти",
      );
      await userEvent.click(
        screen.getByRole("button", { name: dict.common.search }),
      );

      expect(mockPush).toHaveBeenCalledWith(
        "/carousels?search=%D1%85%D1%96%D1%82%D0%B8",
      );
    });
  });
});
