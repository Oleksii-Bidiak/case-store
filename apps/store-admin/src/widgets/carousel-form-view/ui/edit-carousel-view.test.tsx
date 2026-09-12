import { http, HttpResponse } from "msw";
import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { EditCarouselView } from "./edit-carousel-view";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

const carouselId = "11111111-2222-3333-4444-555555555555";

/** Stub `GET /api/admin/carousels/:id` with a carousel on the given source. */
function stubCarousel(source: string) {
  server.use(
    http.get(`*/api/admin/carousels/${carouselId}`, () =>
      HttpResponse.json({
        data: {
          id: carouselId,
          title: "Популярне",
          source,
          placement: "HOME_RAILS",
          categoryId: null,
          itemLimit: 12,
          sortOrder: 0,
          status: "PUBLISHED",
          publishedAt: "2026-07-01T00:00:00.000Z",
          scheduledAt: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        },
      }),
    ),
    // Only reached in the MANUAL case, where the real picker mounts.
    http.get(`*/api/admin/carousels/${carouselId}/items`, () =>
      HttpResponse.json({ data: [] }),
    ),
  );
}

/**
 * AD-CNT-25 (TASK-429): a non-MANUAL carousel used to render NOTHING where the
 * item picker sits, and operators reported that as "reordering is broken". The
 * screen must now explain itself.
 */
describe("EditCarouselView — items section for an automatic source (AD-CNT-25)", () => {
  it("explains that the order is automatic instead of showing an empty space", async () => {
    stubCarousel("BESTSELLING");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(
      await screen.findByText(dict.carouselItems.autoHeading),
    ).toBeInTheDocument();
    // Names the source that is actually in charge…
    expect(
      screen.getByText(
        dict.carouselItems.autoHint(
          dict.carouselForm.sourceOptions.BESTSELLING,
        ),
      ),
    ).toBeInTheDocument();
    // …and the single action that brings the picker back.
    expect(
      screen.getByText(dict.carouselItems.autoSwitchHint),
    ).toBeInTheDocument();
    // The real picker is NOT mounted — no dead search box.
    expect(
      screen.queryByPlaceholderText(dict.carouselItems.searchPlaceholder),
    ).not.toBeInTheDocument();
  });

  it("shows the real picker for a MANUAL carousel", async () => {
    stubCarousel("MANUAL");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(
      await screen.findByPlaceholderText(dict.carouselItems.searchPlaceholder),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.carouselItems.autoHeading),
    ).not.toBeInTheDocument();
  });

  it("swaps the notice for the picker the moment the source select flips to MANUAL", async () => {
    stubCarousel("NEWEST");
    renderWithProviders(<EditCarouselView carouselId={carouselId} />);

    expect(
      await screen.findByText(dict.carouselItems.autoHeading),
    ).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText(dict.carouselForm.source),
      "MANUAL",
    );

    // The gate is on the LIVE select value, so the operator sees the effect of
    // the instruction before saving — which is what makes the hint actionable.
    expect(
      await screen.findByPlaceholderText(dict.carouselItems.searchPlaceholder),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(dict.carouselItems.autoHeading),
    ).not.toBeInTheDocument();
  });
});
