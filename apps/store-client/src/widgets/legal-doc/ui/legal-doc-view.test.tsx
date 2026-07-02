import { renderWithProviders, screen } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { PageEntity } from "@/shared/api/generated/models";
import { LegalDocView } from "./legal-doc-view";

const page = {
  slug: "privacy",
  title: "Політика конфіденційності",
  // Local-time ISO (no "Z") so the rendered day never shifts by timezone.
  updatedAt: "2026-06-12T00:00:00",
  content:
    "<p>Вступ до документа.</p>" +
    "<h2>Загальні положення</h2><p>Перший абзац.</p>" +
    "<h2>Ваші права</h2><ul><li>Право на доступ</li></ul>",
} as unknown as PageEntity;

const otherDocs = [{ slug: "terms", title: "Умови використання" }];

describe("LegalDocView", () => {
  it("renders the document head (badge, title, updated date)", () => {
    renderWithProviders(<LegalDocView page={page} otherDocs={otherDocs} />);

    expect(screen.getByText(dict.legal.badge)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: page.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(/12 червня 2026/)).toBeInTheDocument();
  });

  it("renders the sanitized body with a TOC entry per heading", () => {
    renderWithProviders(<LegalDocView page={page} otherDocs={otherDocs} />);

    expect(screen.getByText("Вступ до документа.")).toBeInTheDocument();

    // Each heading appears once in the body and once as a TOC button.
    for (const label of ["Загальні положення", "Ваші права"]) {
      expect(
        screen.getByRole("heading", { level: 2, name: label }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }
  });

  it("renders the contact CTA and links to the other documents", () => {
    renderWithProviders(<LegalDocView page={page} otherDocs={otherDocs} />);

    expect(screen.getByText(dict.legal.contactHeading)).toBeInTheDocument();
    expect(screen.getByText(dict.legal.otherHeading)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Умови використання" });
    expect(link).toHaveAttribute("href", "/legal/terms");
  });
});
