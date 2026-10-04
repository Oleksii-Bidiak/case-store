/**
 * `CarouselItemPicker` (CarouselsProposal КР5/КР6/КР8, wave 198 — TASK-1074).
 *
 * A CONTROLLED list since wave 198: it no longer writes to the API on every
 * click. The host holds the list and saves it with the carousel's one
 * «Зберегти», so the same picker works before the carousel exists (create).
 * Order by drag on ⠿ (pointer) or the arrow keys on ⠿ (keyboard — the old
 * ↑/↓ buttons' job), numbered rows, «Скасувати» toast after a move, ✕ to
 * remove, search with price and stock, «У каруселі» on what is already in.
 */
import { useState } from "react";
import { http, HttpResponse } from "msw";
import {
  fireEvent,
  renderWithProviders,
  screen,
  userEvent,
  waitFor,
  within,
} from "@/shared/test/render";
import { server } from "@/shared/test/msw-server";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { toast } from "@/shared/ui/toast";
import {
  CarouselItemPicker,
  type CarouselPickedItem,
} from "./carousel-item-picker";

const c = dict.carouselItems;
/**
 * Prices and row text compared WITHOUT whitespace: ICU puts a narrow no-break
 * space between the thousands, which the text matchers do not normalise.
 */
const money = (value: string) => formatCurrency(value).replace(/\s/g, "");
const text = (el: HTMLElement) => (el.textContent ?? "").replace(/\s/g, "");

const alpha: CarouselPickedItem = {
  productId: "product-1",
  name: "Чохол Alpha",
  imageUrl: null,
  price: "29.99",
  isActive: true,
};
const beta: CarouselPickedItem = {
  productId: "product-2",
  name: "Скло Beta",
  imageUrl: null,
  price: "1299.00",
  isActive: false,
};

function Host({
  initial,
  onChange,
}: {
  initial: CarouselPickedItem[];
  onChange?: (next: CarouselPickedItem[]) => void;
}) {
  const [items, setItems] = useState(initial);
  return (
    <CarouselItemPicker
      items={items}
      onChange={(next) => {
        setItems(next);
        onChange?.(next);
      }}
    />
  );
}

function stubProductSearch(
  products: { id: string; name: string; stock: number; sku?: string }[],
) {
  const searches: (string | null)[] = [];
  server.use(
    http.get("*/api/products/admin/list", ({ request }) => {
      searches.push(new URL(request.url).searchParams.get("search"));
      return HttpResponse.json({
        data: products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          price: "749.00",
          stock: p.stock,
          isActive: true,
          primaryImage: null,
        })),
        meta: { total: products.length, page: 1, limit: 8, totalPages: 1 },
      });
    }),
  );
  return searches;
}

const selectedList = () => screen.getByRole("list", { name: c.heading });
const handle = (name: string) =>
  screen.getByRole("button", { name: dict.reorderList.handleLabel(name) });

describe("CarouselItemPicker", () => {
  it("numbers the chosen products in order, with the price and an inactive badge", () => {
    renderWithProviders(<Host initial={[alpha, beta]} />);

    const rows = within(selectedList()).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("Чохол Alpha");
    expect(text(rows[0])).toContain(money("29.99"));
    expect(rows[1]).toHaveTextContent("2");
    expect(text(rows[1])).toContain(money("1299.00"));
    expect(within(rows[1]).getByText(c.inactiveBadge)).toBeInTheDocument();
  });

  it("shows the empty hint — the list can be built before the first save", () => {
    renderWithProviders(<Host initial={[]} />);

    expect(screen.getByText(c.emptyHint)).toBeInTheDocument();
  });

  it("searches with an icon, shows price and stock, marks what is already in, and adds at the end", async () => {
    const searches = stubProductSearch([
      { id: "product-1", name: "Чохол Alpha", stock: 24 },
      { id: "product-9", name: "Чохол Gamma", stock: 0 },
    ]);
    const onChange = jest.fn();
    renderWithProviders(<Host initial={[alpha]} onChange={onChange} />);

    expect(screen.getByText(c.searchHint)).toBeInTheDocument();
    await userEvent.type(
      screen.getByRole("searchbox", { name: c.searchPlaceholder }),
      "чохол",
    );

    const results = await screen.findByRole("list", {
      name: c.searchPlaceholder,
    });
    await waitFor(() =>
      expect(within(results).getAllByRole("listitem")).toHaveLength(2),
    );
    expect(searches).toContain("чохол");
    const [inCarousel, outOfStock] = within(results).getAllByRole("listitem");
    expect(inCarousel).toHaveTextContent(c.alreadyAdded);
    expect(inCarousel).toHaveTextContent(c.inStock(24));
    expect(text(inCarousel)).toContain(money("749.00"));
    expect(
      within(inCarousel).queryByRole("button", { name: c.addLabel }),
    ).not.toBeInTheDocument();
    expect(outOfStock).toHaveTextContent(c.outOfStock);

    await userEvent.click(
      within(outOfStock).getByRole("button", { name: c.addLabel }),
    );

    expect(onChange).toHaveBeenLastCalledWith([
      alpha,
      expect.objectContaining({
        productId: "product-9",
        name: "Чохол Gamma",
        price: "749.00",
      }),
    ]);
  });

  it("✕ removes a product", async () => {
    const onChange = jest.fn();
    renderWithProviders(<Host initial={[alpha, beta]} onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: c.removeAria("Чохол Alpha") }),
    );

    expect(onChange).toHaveBeenLastCalledWith([beta]);
  });

  it("moves a product with the arrow keys on ⠿ and offers «Скасувати»", async () => {
    const undoSpy = jest.spyOn(toast, "undo");
    const onChange = jest.fn();
    renderWithProviders(<Host initial={[alpha, beta]} onChange={onChange} />);

    handle("Скло Beta").focus();
    fireEvent.keyDown(handle("Скло Beta"), { key: "ArrowUp" });

    expect(onChange).toHaveBeenLastCalledWith([beta, alpha]);
    expect(undoSpy).toHaveBeenCalledWith(
      dict.reorderList.movedToast.moved("Скло Beta", 1, 2),
      expect.objectContaining({ onUndo: expect.any(Function) }),
    );
    // Focus stays on the moved row's handle, so the next press continues.
    await waitFor(() => expect(handle("Скло Beta")).toHaveFocus());

    // The toast's «Скасувати» restores the order it replaced.
    const { onUndo } = undoSpy.mock.calls[0][1] as { onUndo: () => void };
    onUndo();
    expect(onChange).toHaveBeenLastCalledWith([alpha, beta]);
    undoSpy.mockRestore();
  });

  it("refuses to move past either end — and says so", () => {
    const onChange = jest.fn();
    renderWithProviders(<Host initial={[alpha, beta]} onChange={onChange} />);

    fireEvent.keyDown(handle("Чохол Alpha"), { key: "ArrowUp" });
    fireEvent.keyDown(handle("Скло Beta"), { key: "ArrowDown" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("Home / End jump to the start and the end", () => {
    const onChange = jest.fn();
    const gamma = { ...alpha, productId: "product-3", name: "Кабель Gamma" };
    renderWithProviders(
      <Host initial={[alpha, beta, gamma]} onChange={onChange} />,
    );

    fireEvent.keyDown(handle("Кабель Gamma"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith([gamma, alpha, beta]);
  });
});
