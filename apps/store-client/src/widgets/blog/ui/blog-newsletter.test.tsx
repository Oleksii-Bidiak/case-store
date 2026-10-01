import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { BlogNewsletter } from "./blog-newsletter";

describe("BlogNewsletter — the shop's real social channels (TASK-873)", () => {
  it("links each channel the owner filled in, and nothing else", () => {
    renderWithProviders(
      <BlogNewsletter
        contact={{
          telegramLink: "https://t.me/shop",
          instagramLink: null,
          viberLink: "viber://chat?number=%2B380000000000",
        }}
      />,
    );

    const telegram = screen.getByRole("link", { name: "Telegram" });
    expect(telegram).toHaveAttribute("href", "https://t.me/shop");
    expect(telegram).toHaveAttribute("target", "_blank");
    expect(telegram).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Viber" })).toHaveAttribute(
      "href",
      "viber://chat?number=%2B380000000000",
    );
    expect(
      screen.queryByRole("link", { name: "Instagram" }),
    ).not.toBeInTheDocument();
    // No field for it in «Контакти магазину», so no button (TASK-741).
    expect(screen.queryByText("YouTube")).not.toBeInTheDocument();
  });

  it("renders no social row and no dead `#` link without any channel", () => {
    const { container } = renderWithProviders(
      <BlogNewsletter contact={null} />,
    );

    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector('a[href="#"]')).toBeNull();
  });

  it("still renders the newsletter subscribe form (regression)", () => {
    renderWithProviders(<BlogNewsletter />);

    expect(
      screen.getByPlaceholderText(dict.newsletterForm.placeholder),
    ).toBeInTheDocument();
  });
});
