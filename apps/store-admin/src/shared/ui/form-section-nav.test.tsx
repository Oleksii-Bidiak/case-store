import { render, screen, userEvent, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import { CollapsibleSection } from "./collapsible-section";
import { FormSectionNav } from "./form-section-nav";
import { StatusDot } from "./status-dot";

/** Product form Ф1 / category form КТ5: the section index on the left. */
describe("FormSectionNav", () => {
  const sections = [
    {
      id: "basic",
      label: "Основне",
      status: "primary" as const,
      statusLabel: "є зміни",
    },
    {
      id: "price",
      label: "Ціна і склад",
      status: "success" as const,
      statusLabel: "заповнено",
    },
    { id: "seo", label: "SEO і соцмережі" },
  ];

  it("is a labelled nav of in-page anchors with status dots", () => {
    render(
      <FormSectionNav
        aria-label="Розділи форми"
        sections={sections}
        activeId="basic"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Розділи форми" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#basic",
      "#price",
      "#seo",
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "location");
    expect(links[1]).not.toHaveAttribute("aria-current");
    // The dot's meaning is in text too.
    expect(links[0]).toHaveTextContent("є зміни");
  });

  it("marks the section the operator jumped to", async () => {
    const user = userEvent.setup();
    render(<FormSectionNav aria-label="Розділи" sections={sections} />);
    await user.click(screen.getByRole("link", { name: /Ціна і склад/ }));
    expect(screen.getByRole("link", { name: /Ціна і склад/ })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("is sticky on desktop and a horizontal scroller on mobile", () => {
    render(<FormSectionNav aria-label="Розділи" sections={sections} />);
    const list = screen.getByRole("list");
    expect(list).toHaveClass("overflow-x-auto", "md:flex-col");
    expect(screen.getByRole("navigation")).toHaveClass("md:sticky");
  });
});

describe("StatusDot", () => {
  it.each([
    ["success", "bg-success"],
    ["warning", "bg-warning"],
    ["primary", "bg-primary"],
  ] as const)("%s dot with an sr-only label", (tone, cls) => {
    const { container } = render(<StatusDot tone={tone} label="готово" />);
    expect(container.querySelector("[data-slot=status-dot]")).toHaveClass(
      cls,
      "size-2",
      "rounded-full",
    );
    expect(screen.getByText("готово")).toHaveClass("sr-only");
  });
});

describe("CollapsibleSection", () => {
  it("shows the summary while collapsed and the content when expanded", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection
        title="SEO і соцмережі"
        summary="Заголовок і опис для Google заповнені."
      >
        <label>
          Теги <input />
        </label>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("heading", { name: "SEO і соцмережі" }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: dict.canon.expand });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByText("Заголовок і опис для Google заповнені."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(toggle);
    const collapse = screen.getByRole("button", { name: dict.canon.collapse });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Теги" })).toBeInTheDocument();
    expect(
      document.getElementById(collapse.getAttribute("aria-controls") ?? ""),
    ).toContainElement(screen.getByRole("textbox"));
  });

  it("can start open", () => {
    render(
      <CollapsibleSection title="SEO" summary="—" defaultOpen>
        <p>Вміст</p>
      </CollapsibleSection>,
    );
    expect(screen.getByText("Вміст")).toBeInTheDocument();
  });
});
