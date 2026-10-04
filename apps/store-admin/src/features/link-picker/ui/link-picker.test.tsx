import { useState } from "react";
import { http, HttpResponse } from "msw";
import {
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { Label } from "@/shared/ui";
import { LinkPicker } from "./link-picker";

const l = dict.linkPicker;

/** A tiny host holding the value, as the banner form does. */
function Host({
  initial = "",
  onChange,
}: {
  initial?: string;
  onChange?: (href: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Label htmlFor="cta">Куди веде кнопка</Label>
      <LinkPicker
        id="cta"
        value={value}
        onChange={(href) => {
          setValue(href);
          onChange?.(href);
        }}
      />
    </>
  );
}

const trigger = () =>
  screen.getByRole("combobox", { name: "Куди веде кнопка" });

const TREE = [
  {
    id: "c1",
    name: "Захисне скло",
    slug: "screen-protectors",
    isActive: true,
    sortOrder: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    children: [
      {
        id: "c2",
        name: "для iPhone",
        slug: "glass-iphone",
        isActive: true,
        sortOrder: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        children: [],
      },
    ],
  },
  {
    id: "c3",
    name: "Чохли",
    slug: "cases",
    isActive: true,
    sortOrder: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    children: [],
  },
];

describe("LinkPicker", () => {
  it("shows the placeholder with no link", () => {
    renderWithProviders(<Host />);
    expect(trigger()).toHaveTextContent(l.placeholder);
  });

  it("reads a stored section back as «Розділ · Каталог» and says where it leads", () => {
    renderWithProviders(<Host initial="/products" />);
    expect(trigger()).toHaveTextContent(l.tabSection);
    expect(trigger()).toHaveTextContent(l.sectionCatalog);
    expect(trigger()).toHaveAccessibleDescription(
      `${l.leadsTo} /products — ${l.noteCatalog}.`,
    );
  });

  it("an unknown address stays «Своє», untouched", () => {
    renderWithProviders(<Host initial="https://example.com/sale" />);
    expect(trigger()).toHaveTextContent(l.tabCustom);
    expect(trigger()).toHaveTextContent("https://example.com/sale");
  });

  it("picks a site section", async () => {
    const onChange = jest.fn();
    renderWithProviders(<Host onChange={onChange} />);

    await userEvent.click(trigger());
    await userEvent.click(
      await screen.findByRole("button", { name: new RegExp(l.sectionPromo) }),
    );

    expect(onChange).toHaveBeenLastCalledWith("/promo");
    await waitFor(() => expect(trigger()).toHaveTextContent(l.sectionPromo));
  });

  it("searches categories by name and stores /categories/<slug>", async () => {
    server.use(
      http.get("*/api/categories/tree", () =>
        HttpResponse.json({ data: TREE }),
      ),
    );
    const onChange = jest.fn();
    renderWithProviders(<Host onChange={onChange} />);

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("tab", { name: l.tabCategory }));
    await userEvent.type(
      screen.getByRole("searchbox", { name: l.categorySearch }),
      "iphone",
    );

    const option = await screen.findByRole("button", {
      name: /Захисне скло → для iPhone/,
    });
    expect(
      screen.queryByRole("button", { name: /Чохли/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(option);

    expect(onChange).toHaveBeenLastCalledWith("/categories/glass-iphone");
    await waitFor(() =>
      expect(trigger()).toHaveTextContent("Захисне скло → для iPhone"),
    );
  });

  it("searches products through the API and stores /products/<slug>", async () => {
    const searches: (string | null)[] = [];
    server.use(
      http.get("*/api/products", ({ request }) => {
        searches.push(new URL(request.url).searchParams.get("search"));
        return HttpResponse.json({
          data: [
            {
              id: "p1",
              name: "Чохол MagSafe",
              slug: "case-magsafe",
              price: "899.00",
            },
          ],
          meta: { total: 1, page: 1, limit: 8, totalPages: 1 },
        });
      }),
    );
    const onChange = jest.fn();
    renderWithProviders(<Host onChange={onChange} />);

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("tab", { name: l.tabProduct }));
    expect(screen.getByText(l.productSearchHint)).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("searchbox", { name: l.productSearch }),
      "чохол",
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /Чохол MagSafe/ }),
    );

    expect(searches).toContain("чохол");
    expect(onChange).toHaveBeenLastCalledWith("/products/case-magsafe");
    await waitFor(() => expect(trigger()).toHaveTextContent("Чохол MagSafe"));
  });

  it("takes any address on «Своє»", async () => {
    const onChange = jest.fn();
    renderWithProviders(<Host onChange={onChange} />);

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("tab", { name: l.tabCustom }));
    await userEvent.type(
      screen.getByRole("textbox", { name: l.customLabel }),
      "https://partner.example/sale",
    );
    await userEvent.click(screen.getByRole("button", { name: l.customApply }));

    expect(onChange).toHaveBeenLastCalledWith("https://partner.example/sale");
  });

  it("clears the link", async () => {
    const onChange = jest.fn();
    renderWithProviders(<Host initial="/promo" onChange={onChange} />);

    await userEvent.click(trigger());
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: l.clear }),
    );

    expect(onChange).toHaveBeenLastCalledWith("");
    await waitFor(() => expect(trigger()).toHaveTextContent(l.placeholder));
  });
});
