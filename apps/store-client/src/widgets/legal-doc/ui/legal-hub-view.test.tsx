import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { LegalHubView, type LegalHubDoc } from "./legal-hub-view";

const docs: LegalHubDoc[] = [
  {
    slug: "privacy",
    title: "Політика конфіденційності",
    excerpt: "Як ми захищаємо ваші дані.",
    // Local-time ISO (no "Z") so the rendered day never shifts by timezone.
    updatedAt: "2026-06-12T00:00:00",
  },
  {
    slug: "terms",
    title: "Умови використання",
    excerpt: "Правила користування сайтом.",
    updatedAt: "2026-06-05T00:00:00",
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

  it("renders the support CTA linking to the contacts destination", () => {
    renderWithProviders(<LegalHubView docs={docs} />);

    expect(screen.getByText(dict.legal.hub.supportHeading)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: dict.legal.hub.supportCta }),
    ).toHaveAttribute("href", dict.legal.contactHref);
  });

  it("shows the empty state when there are no documents", () => {
    renderWithProviders(<LegalHubView docs={[]} />);
    expect(screen.getByText(dict.legal.hub.empty)).toBeInTheDocument();
  });
});
