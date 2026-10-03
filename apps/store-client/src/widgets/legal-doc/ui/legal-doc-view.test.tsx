import { renderWithProviders, screen, userEvent } from "@/shared/test/render";
import { dict } from "@/shared/config";
import type { PageEntity } from "@/shared/api/generated/models";
import { LegalDocView } from "./legal-doc-view";

const page = {
  slug: "privacy",
  title: "Політика конфіденційності",
  // Local-time ISO (no "Z") so the rendered day never shifts by timezone.
  updatedAt: "2026-06-12T09:00:00Z",
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

describe("LegalDocView — collapsed TOC below lg (TASK-878)", () => {
  it("names the disclosure row with the section count, Ukrainian plural", () => {
    expect(dict.legal.tocToggle(1)).toBe("Зміст документа · 1 розділ");
    expect(dict.legal.tocToggle(3)).toBe("Зміст документа · 3 розділи");
    expect(dict.legal.tocToggle(5)).toBe("Зміст документа · 5 розділів");
    expect(dict.legal.tocToggle(11)).toBe("Зміст документа · 11 розділів");
    expect(dict.legal.tocToggle(22)).toBe("Зміст документа · 22 розділи");
  });

  it("toggles the list with aria-expanded and folds it back after a jump", async () => {
    const scrollTo = jest.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    const user = userEvent.setup();
    renderWithProviders(<LegalDocView page={page} otherDocs={otherDocs} />);

    const toggle = screen.getByRole("button", {
      name: dict.legal.tocToggle(2),
    });
    const list = screen.getByRole("navigation", { name: dict.legal.tocAria });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", list.id);
    // Collapsed below lg, always shown from lg.
    expect(list).toHaveClass("hidden", "lg:flex");
    expect(toggle).toHaveClass("lg:hidden", "min-h-12");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(list).not.toHaveClass("hidden");
    expect(list).toHaveClass("flex");

    await user.click(screen.getByRole("button", { name: /Ваші права/ }));
    expect(scrollTo).toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("gives the article phone padding px-4 py-6 (≥320px of text at 390), the roomy one from sm", () => {
    const { container } = renderWithProviders(
      <LegalDocView page={page} otherDocs={otherDocs} />,
    );
    const article = container.querySelector("article") as HTMLElement;
    expect(article).toHaveClass("px-4", "py-6", "sm:px-11", "sm:py-9");
    expect(article).not.toHaveClass("px-11");
  });
});
