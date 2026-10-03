import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { LegalHubView, type LegalHubDoc } from "./legal-hub-view";

const docs: LegalHubDoc[] = [
  {
    slug: "privacy",
    title: "Політика конфіденційності",
    excerpt: "Як ми захищаємо ваші дані.",
    // Local-time ISO (no "Z") so the rendered day never shifts by timezone.
    updatedAt: "2026-06-12T09:00:00Z",
  },
  {
    slug: "terms",
    title: "Умови використання",
    excerpt: "Правила користування сайтом.",
    updatedAt: "2026-06-05T09:00:00Z",
  },
];

describe("LegalHubView", () => {
  it("renders the hero and a tile per document, linking to /legal/[slug]", () => {
    renderWithProviders(<LegalHubView docs={docs} />);

    expect(screen.getByText(dict.legal.hub.badge)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: dict.legal.hub.heading }),
    ).toBeInTheDocument();

    const privacy = screen.getByRole("link", {
      name: /Політика конфіденційності/,
    });
    expect(privacy).toHaveAttribute("href", "/legal/privacy");
    expect(screen.getByText(/Оновлено 12 черв\. 2026/)).toBeInTheDocument();

    const terms = screen.getByRole("link", { name: /Умови використання/ });
    expect(terms).toHaveAttribute("href", "/legal/terms");
  });

  it("renders the support CTA linking to the /contact form (TASK-866)", () => {
    renderWithProviders(<LegalHubView docs={docs} />);

    expect(screen.getByText(dict.legal.hub.supportHeading)).toBeInTheDocument();
    // /contact is the single contact form (owner decision 7.8) — not the
    // /info Contacts tab it used to point at.
    expect(
      screen.getByRole("link", { name: dict.legal.hub.supportCta }),
    ).toHaveAttribute("href", "/contact");
  });

  it("keeps the support CTA the hub's one primary, with a focus ring (TASK-865)", () => {
    const { container } = renderWithProviders(<LegalHubView docs={docs} />);

    const filled = container.querySelectorAll(".bg-primary");
    expect(filled).toHaveLength(1);
    expect(filled[0]).toBe(
      screen.getByRole("link", { name: dict.legal.hub.supportCta }),
    );
    expect(filled[0].className).toMatch(/focus-visible:ring/);
  });

  it("shows the §6 empty state with the support action as its one primary (TASK-870)", () => {
    const { container } = renderWithProviders(<LegalHubView docs={[]} />);

    expect(screen.getByText(dict.legal.hub.empty)).toBeInTheDocument();
    expect(screen.getByText(dict.legal.hub.emptyBody)).toBeInTheDocument();

    // The empty card carries the action; the support card is not rendered,
    // so the hub still has exactly one primary.
    const cta = screen.getByRole("link", { name: dict.legal.hub.supportCta });
    expect(cta).toHaveAttribute("href", "/contact");
    expect(cta).toHaveClass("h-11");
    expect(
      screen.queryByText(dict.legal.hub.supportHeading),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);

    // The glyph is decoration.
    expect(
      container.querySelector(".size-18")?.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});
