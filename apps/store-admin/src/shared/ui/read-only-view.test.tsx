import { render, screen, userEvent, within } from "@/shared/test/render";
import { dict } from "@/shared/config";
import {
  ReadOnlyBool,
  ReadOnlyField,
  ReadOnlyImage,
  ReadOnlyLayout,
  ReadOnlyLink,
  ReadOnlyNotice,
  ReadOnlyRelation,
  ReadOnlyRichText,
  ReadOnlySection,
  ReadOnlySwatch,
  ReadOnlyTags,
  isReadOnlyEmpty,
} from "./read-only-view";

const t = dict.readOnlyView;

/** Plan 186, TASK-667 — ReadOnlyTemplate РО-1…РО-5. */
describe("read-only view primitive", () => {
  it("a section is a named region with a label/value list, values as text", () => {
    render(
      <ReadOnlySection title="Текст">
        <ReadOnlyField label="Заголовок">
          Аксесуари для вашого iPhone
        </ReadOnlyField>
      </ReadOnlySection>,
    );
    const region = screen.getByRole("region", { name: "Текст" });
    const term = within(region).getByRole("term");
    expect(term).toHaveTextContent("Заголовок");
    expect(within(region).getByRole("definition")).toHaveTextContent(
      "Аксесуари для вашого iPhone",
    );
    // Text, not a control.
    expect(within(region).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("an empty value reads «Не задано», with its consequence when given", () => {
    render(
      <ReadOnlySection title="SEO">
        <ReadOnlyField label="Підзаголовок">{"   "}</ReadOnlyField>
        <ReadOnlyField
          label="Опис для Google"
          emptyConsequence="Google візьме початок тексту"
        >
          {null}
        </ReadOnlyField>
      </ReadOnlySection>,
    );
    const values = screen.getAllByRole("definition");
    expect(values[0]).toHaveTextContent(t.notSet);
    expect(values[1]).toHaveTextContent(
      t.notSetWith("Google візьме початок тексту"),
    );
  });

  it("`empty` forces «Не задано» for an element child, and 0 is a value", () => {
    render(
      <ReadOnlySection title="Різне">
        <ReadOnlyField label="Теги" empty>
          <ReadOnlyTags tags={[]} />
        </ReadOnlyField>
        <ReadOnlyField label="Ціна">{0}</ReadOnlyField>
      </ReadOnlySection>,
    );
    const values = screen.getAllByRole("definition");
    expect(values[0]).toHaveTextContent(t.notSet);
    expect(values[1]).toHaveTextContent("0");
    expect(isReadOnlyEmpty(0)).toBe(false);
    expect(isReadOnlyEmpty([])).toBe(true);
    expect(isReadOnlyEmpty(false)).toBe(true);
  });

  it("value variants: link, relation, image, swatch, bool, tags, rich text", () => {
    render(
      <ReadOnlySection title="Варіанти">
        <ReadOnlyField label="Куди веде">
          <ReadOnlyLink href="https://shop.test/products" external>
            Каталог · /products
          </ReadOnlyLink>
        </ReadOnlyField>
        <ReadOnlyField label="Категорія">
          <ReadOnlyRelation href="/categories/c1/edit">Чохли</ReadOnlyRelation>
        </ReadOnlyField>
        <ReadOnlyField label="Бренд">
          <ReadOnlyRelation href={null}>Apple</ReadOnlyRelation>
        </ReadOnlyField>
        <ReadOnlyField label="Фото">
          <ReadOnlyImage
            src="/a.webp"
            alt="Зображення банера"
            caption="a.webp"
          />
        </ReadOnlyField>
        <ReadOnlyField label="Колір">
          <ReadOnlySwatch dotClassName="bg-sale">Червона</ReadOnlySwatch>
        </ReadOnlyField>
        <ReadOnlyField label="На сайті">
          <ReadOnlyBool value={false} on="Показується" off="Приховано" />
        </ReadOnlyField>
        <ReadOnlyField label="Теги">
          <ReadOnlyTags tags={["чохол", "magsafe"]} />
        </ReadOnlyField>
      </ReadOnlySection>,
    );
    const external = screen.getByRole("link", { name: /Каталог/ });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAccessibleName(
      expect.stringContaining(t.opensInNewTab),
    );
    expect(screen.getByRole("link", { name: "Чохли" })).toHaveAttribute(
      "href",
      "/categories/c1/edit",
    );
    // No right to open the brand: its name, no dead link.
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apple" })).toBeNull();
    expect(
      screen.getByRole("img", { name: "Зображення банера" }),
    ).toBeVisible();
    expect(screen.getByText("Червона")).toBeInTheDocument();
    expect(screen.getByText("Приховано")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(
      ["чохол", "magsafe"],
    );
  });

  it("rich text renders as formatted text, not HTML source", () => {
    render(<ReadOnlyRichText html="<h2>Доставка</h2><p>Новою Поштою</p>" />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Доставка" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
  });

  it("the notice says why, and offers «Редагувати» only when given an edit target", async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ReadOnlyNotice>{t.notices.banners}</ReadOnlyNotice>,
    );
    expect(screen.getByText(t.notices.banners)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: dict.common.edit }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: dict.common.edit }),
    ).not.toBeInTheDocument();

    rerender(
      <ReadOnlyNotice edit={{ onClick }}>{t.notices.banners}</ReadOnlyNotice>,
    );
    await user.click(screen.getByRole("button", { name: dict.common.edit }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <ReadOnlyNotice edit={{ href: "/banners/b1/edit" }}>
        {t.notices.banners}
      </ReadOnlyNotice>,
    );
    expect(
      screen.getByRole("link", { name: dict.common.edit }),
    ).toHaveAttribute("href", "/banners/b1/edit");
  });

  it("the layout keeps the form's side column", () => {
    render(
      <ReadOnlyLayout aside={<p>Так виглядає на сайті</p>}>
        <ReadOnlySection title="Текст">
          <ReadOnlyField label="Заголовок">X</ReadOnlyField>
        </ReadOnlySection>
      </ReadOnlyLayout>,
    );
    expect(
      within(screen.getByRole("complementary")).getByText(
        "Так виглядає на сайті",
      ),
    ).toBeInTheDocument();
  });
});
