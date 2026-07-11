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

type Source = "BESTSELLING" | "NEWEST" | "ON_SALE" | "CATEGORY" | "MANUAL";
type Status = "DRAFT" | "SCHEDULED" | "PUBLISHED";

function makeCarouselRow(
  id: string,
  title: string,
  source: Source,
  status: Status,
) {
  return {
    id,
    title,
    source,
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

function stubCarousels(rows: ReturnType<typeof makeCarouselRow>[]) {
  server.use(
    http.get("*/api/admin/carousels", () => HttpResponse.json({ data: rows })),
  );
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
});
