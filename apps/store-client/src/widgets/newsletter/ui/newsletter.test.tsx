import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { Newsletter } from "./newsletter";

/**
 * TASK-741 — the social row comes from «Контакти магазину». It used to be four
 * dictionary placeholders (`href: "#"`) answering a click with a «незабаром»
 * toast (TASK-267), while the owner's real links went unused.
 */
describe("Newsletter — social channels from the contact settings (TASK-741)", () => {
  it("links every channel the owner filled in, in a new tab", () => {
    renderWithProviders(
      <Newsletter
        contact={{
          telegramLink: "https://t.me/shop",
          instagramLink: "https://instagram.com/shop",
          viberLink: "viber://chat?number=%2B380501234567",
        }}
      />,
    );

    const telegram = screen.getByRole("link", { name: "Telegram" });
    expect(telegram).toHaveAttribute("href", "https://t.me/shop");
    expect(telegram).toHaveAttribute("target", "_blank");
    expect(telegram).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      "https://instagram.com/shop",
    );
    expect(screen.getByRole("link", { name: "Viber" })).toHaveAttribute(
      "href",
      "viber://chat?number=%2B380501234567",
    );
  });

  it("leaves out a channel without a link — no dead «#» and no «soon» button", () => {
    renderWithProviders(
      <Newsletter
        contact={{
          telegramLink: "https://t.me/shop",
          instagramLink: null,
          viberLink: "",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Telegram" })).toBeInTheDocument();
    expect(screen.queryByText("Instagram")).not.toBeInTheDocument();
    expect(screen.queryByText("Viber")).not.toBeInTheDocument();
    // YouTube has no field in the contact settings, so it is never offered.
    expect(screen.queryByText("YouTube")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="#"]')).toBeNull();
  });

  it("renders no social row at all when nothing is configured or the fetch failed", () => {
    renderWithProviders(<Newsletter contact={null} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("still renders the newsletter subscribe form (regression)", () => {
    renderWithProviders(<Newsletter />);

    expect(
      screen.getByPlaceholderText(dict.newsletterForm.placeholder),
    ).toBeInTheDocument();
  });
});
