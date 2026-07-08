import { toast } from "sonner";
import { renderWithProviders, screen, fireEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BlogNewsletter } from "./blog-newsletter";

// The social channels have no real URLs yet (href "#"), so each renders an
// honest "coming soon" toast button — not a dead anchor (TASK-267 / F-18).
jest.mock("sonner", () => ({ toast: jest.fn() }));

describe("BlogNewsletter — placeholder social links (TASK-267)", () => {
  afterEach(() => jest.clearAllMocks());

  it("renders each placeholder channel as a button, not a dead anchor", () => {
    renderWithProviders(<BlogNewsletter />);

    for (const { label } of dict.blog.newsletter.socials) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: label }),
      ).not.toBeInTheDocument();
    }
  });

  it("shows a «coming soon» toast when a placeholder channel is clicked", () => {
    renderWithProviders(<BlogNewsletter />);

    fireEvent.click(
      screen.getByRole("button", {
        name: dict.blog.newsletter.socials[0].label,
      }),
    );

    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(dict.blog.newsletter.socialSoon);
  });

  it("still renders the newsletter subscribe form (regression)", () => {
    renderWithProviders(<BlogNewsletter />);

    expect(
      screen.getByPlaceholderText(dict.newsletterForm.placeholder),
    ).toBeInTheDocument();
  });
});
