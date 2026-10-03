import { render, screen } from "@testing-library/react";
import { dict } from "@/shared/config";
import Loading from "./loading";

/**
 * TASK-1053 (canon 1.7): /settings/search had no loading.tsx, so navigating to
 * it showed the DASHBOARD skeleton of the parent segment. Its own one keeps the
 * page heading and draws the two cards the page has.
 */
describe("/settings/search loading.tsx (TASK-1053)", () => {
  it("keeps the page heading", () => {
    render(<Loading />);

    expect(
      screen.getByRole("heading", { level: 2, name: dict.searchIndex.heading }),
    ).toBeInTheDocument();
    expect(screen.getByText(dict.searchIndex.subheading)).toBeInTheDocument();
  });

  it("draws the index card and the synonyms card", () => {
    const { container } = render(<Loading />);

    expect(
      container.querySelectorAll("[data-slot='settings-card-skeleton']"),
    ).toHaveLength(2);
  });
});
