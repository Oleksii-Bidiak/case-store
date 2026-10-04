import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { MediaLibraryPageSkeleton } from "./media-library-page-skeleton";

/**
 * МТ11: the route's loading UI keeps the page heading and draws the grid the
 * page will have — cards with their caption lines, not bare squares.
 */
describe("MediaLibraryPageSkeleton", () => {
  it("keeps the «Медіатека» heading", () => {
    renderWithProviders(<MediaLibraryPageSkeleton />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: dict.mediaLibrary.heading,
      }),
    ).toBeInTheDocument();
  });

  it("draws ten card skeletons", () => {
    const { container } = renderWithProviders(<MediaLibraryPageSkeleton />);

    expect(
      container.querySelectorAll("[data-slot='media-card-skeleton']"),
    ).toHaveLength(10);
  });
});
